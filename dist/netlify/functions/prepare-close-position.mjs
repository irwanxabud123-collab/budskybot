import { randomUUID } from 'node:crypto';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { LiveControlStore } from '../../src/control/live-control.js';
import { JupiterClient } from '../../src/execution/jupiter.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { inspectTransaction } from '../../src/security/transaction-inspector.js';
import { authorized } from '../../src/api/auth.js';
import { RiskEngine } from '../../src/engine/risk.js';
import { loadLiveRiskState } from '../../src/engine/live-risk.js';
import { buildLiveDecisionContext } from '../../src/market-data/live-context.js';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const json = (x) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v);
export default async function (req) {
    if (req.method !== 'POST')
        return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    let c;
    try {
        c = loadConfig();
    }
    catch (e) {
        return Response.json({ error: 'config_invalid', detail: e instanceof Error ? e.message : 'unknown' }, { status: 503 });
    }
    if (c.MODE !== 'LIVE' || !c.LIVE_ENABLED || c.EMERGENCY_STOP || !c.LIVE_BROWSER_EXECUTION_ENABLED || c.WALLET_SIGNING_MODE !== 'BROWSER')
        return Response.json({ error: 'live_browser_execution_not_enabled' }, { status: 409 });
    const control = await new LiveControlStore(c).get().catch(() => null);
    if (!control || control.mode !== 'LIVE' || !control.liveEnabled || control.emergencyStop)
        return Response.json({ error: 'live_control_plane_locked', control }, { status: 409 });
    const idem = req.headers.get('x-idempotency-key');
    if (!idem || idem.length < 16 || idem.length > 128)
        return Response.json({ error: 'valid_x_idempotency_key_required' }, { status: 400 });
    try {
        const body = await req.json();
        if (!body.wallet || !body.positionId)
            return Response.json({ error: 'wallet_positionId_required' }, { status: 400 });
        const wallet = new PublicKey(body.wallet).toBase58();
        if (!authorized(req, c, wallet))
            return Response.json({ error: 'wallet_auth_required' }, { status: 401 });
        const store = new SupabaseEventStore(c);
        const entry = await store.getTradeById(body.positionId);
        if (!entry)
            return Response.json({ error: 'POSITION_NOT_FOUND' }, { status: 404 });
        if (entry.walletPublicKey !== wallet || entry.positionId !== body.positionId)
            return Response.json({ error: 'POSITION_WALLET_MISMATCH' }, { status: 422 });
        if (entry.tradeSide !== 'ENTRY' || !['CONFIRMED', 'RECONCILED'].includes(entry.state) || !entry.signature)
            return Response.json({ error: 'POSITION_NOT_CONFIRMED', state: entry.state }, { status: 409 });
        if (!entry.positionQuantityRaw || entry.positionQuantityRaw <= 0n)
            return Response.json({ error: 'POSITION_QUANTITY_NOT_RECONCILED' }, { status: 409 });
        const existing = await store.getTradeByIdempotency(idem);
        if (existing) {
            return new Response(json({ tradeId: existing.tradeId, requestId: existing.requestId, transaction: existing.transaction, quote: existing.quote, state: existing.state, replay: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const lockKey = `wallet:${wallet}`;
        if (!(await store.claimLease(lockKey, idem, 120000)))
            return Response.json({ error: 'WALLET_EXECUTION_BUSY' }, { status: 409 });
        let keep = false;
        try {
            const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
            const tokenBalance = await conn.getTokenAccountsByOwner(new PublicKey(wallet), { mint: new PublicKey(entry.intent.outputMint) }, { commitment: 'confirmed' });
            if (tokenBalance.value.length === 0)
                return Response.json({ error: 'POSITION_TOKEN_ACCOUNT_NOT_FOUND' }, { status: 409 });
            let available = 0n;
            for (const a of tokenBalance.value) {
                const parsed = a.account.data?.parsed?.info?.tokenAmount?.amount;
                if (typeof parsed === 'string' && /^\d+$/.test(parsed))
                    available += BigInt(parsed);
            }
            if (available < entry.positionQuantityRaw)
                return Response.json({ error: 'POSITION_BALANCE_CHANGED', 'expectedRaw': entry.positionQuantityRaw, 'availableRaw': available }, { status: 409 });
            const order = await new JupiterClient(c).order(entry.intent.outputMint, USDC, entry.positionQuantityRaw, wallet, c.MAX_SLIPPAGE_BPS);
            if (order.quote.priceImpactPct > c.MAX_PRICE_IMPACT_PCT)
                return Response.json({ error: 'PRICE_IMPACT_TOO_HIGH', priceImpactPct: order.quote.priceImpactPct }, { status: 422 });
            const riskState = await loadLiveRiskState(conn, c, new PublicKey(wallet), 0, entry.intent.outputMint, store);
            const decision = await buildLiveDecisionContext(c, conn, order.quote, entry.intent.outputMint, USDC, c.OUTPUT_DECIMALS, c.INPUT_DECIMALS, Date.now(), entry.intent.outputMint);
            const exitMarket = decision.market;
            const exitApproval = new RiskEngine(c).approveExit(exitMarket, riskState);
            if (exitApproval.decision !== 'APPROVE')
                return Response.json({ error: 'EXIT_RISK_REJECTED', approval: exitApproval }, { status: 422 });
            if (!order.transaction || !order.requestId)
                return Response.json({ error: 'jupiter_transaction_unavailable' }, { status: 503 });
            const inspection = await inspectTransaction(conn, order.transaction, c, entry.intent.outputMint, USDC, wallet, entry.positionQuantityRaw, order.quote.minOutputAmount);
            if (!inspection.valid)
                return Response.json({ error: 'transaction_intent_rejected', inspection }, { status: 422 });
            const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
            const simulation = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' });
            if (simulation.value.err)
                return Response.json({ error: 'transaction_simulation_failed', simulationError: simulation.value.err, logs: simulation.value.logs?.slice(-20) }, { status: 422 });
            const now = Date.now(), signalId = randomUUID(), tradeId = randomUUID(), executionId = randomUUID();
            const trade = { walletPublicKey: wallet, tradeId, signalId, executionId, state: 'TRANSACTION_BUILT', createdAtMs: now, positionId: body.positionId, tradeSide: 'EXIT', intent: { walletPublicKey: wallet, tradeId, signalId, inputMint: entry.intent.outputMint, outputMint: USDC, inputAmountRaw: entry.positionQuantityRaw, expectedOutputRaw: order.quote.outAmount, maxSlippageBps: c.MAX_SLIPPAGE_BPS, timestampMs: now, riskApproved: true }, requestId: order.requestId, idempotencyKey: idem, quote: order.quote, transaction: order.transaction };
            const saved = await store.createOrGetTrade(trade);
            keep = true;
            await store.append('position_close_prepared', { tradeId, positionId: body.positionId, wallet, signature: null, quote: order.quote });
            return new Response(json({ tradeId: saved.tradeId, positionId: body.positionId, requestId: saved.requestId ?? order.requestId, transaction: saved.transaction ?? order.transaction, quote: saved.quote ?? order.quote, inspection, simulation: { ok: true, unitsConsumed: simulation.value.unitsConsumed }, execution: { venue: 'Jupiter Swap API V2', walletSigning: 'browser', confirmationRequired: true } }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        }
        finally {
            if (!keep)
                try {
                    await store.releaseLease(lockKey);
                }
                catch { }
        }
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'prepare_close_failed' }, { status: 500 });
    }
}
