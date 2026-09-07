import { randomUUID } from 'node:crypto';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { LiveControlStore } from '../../src/control/live-control.js';
import { JupiterClient } from '../../src/execution/jupiter.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { RiskEngine } from '../../src/engine/risk.js';
import { loadLiveRiskState } from '../../src/engine/live-risk.js';
import { inspectTransaction } from '../../src/security/transaction-inspector.js';
import { validateMint } from '../../src/security/token-validator.js';
import { authorized } from '../../src/api/auth.js';
import { ReplayLogger } from '../../src/replay/logger.js';
import { ConservativeStrategy } from '../../src/engine/strategy.js';
import { makeReplayEvent } from '../../src/replay/runtime-event.js';
import { buildLiveDecisionContext } from '../../src/market-data/live-context.js';
import { evaluateTokenPolicy, defaultTokenPolicy } from '../../src/security/token-policy.js';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const json = (x) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v);
function parseUsdcAmount(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,6})?$/.test(text))
        throw new Error('INVALID_USDC_AMOUNT');
    const [whole, fraction = ''] = text.split('.');
    const raw = BigInt(whole ?? '') * 1000000n + BigInt(((fraction ?? '') + '000000').slice(0, 6));
    if (raw <= 0n)
        throw new Error('AMOUNT_TOO_SMALL');
    return { display: `${whole}.${((fraction ?? '') + '000000').slice(0, 6)}`.replace(/\.0+$/, ''), raw };
}
async function tokenInfo(c, mint) {
    const u = `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`;
    const r = await fetch(u, { headers: c.JUPITER_API_KEY ? { 'x-api-key': c.JUPITER_API_KEY } : {}, signal: AbortSignal.timeout(7000) });
    if (!r.ok)
        throw new Error(`TOKEN_INFO_${r.status}`);
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows.find((x) => x.id === mint) : null;
    if (!row)
        throw new Error('TOKEN_NOT_FOUND');
    return row;
}
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
    if (c.MODE !== 'LIVE' || !c.LIVE_ENABLED || c.EMERGENCY_STOP || !c.LIVE_BROWSER_EXECUTION_ENABLED)
        return Response.json({ error: 'live_browser_execution_not_enabled' }, { status: 409 });
    const control = await new LiveControlStore(c).get().catch(() => null);
    if (!control || control.mode !== 'LIVE' || !control.liveEnabled || control.emergencyStop)
        return Response.json({ error: 'live_control_plane_locked', control }, { status: 409 });
    if (c.WALLET_SIGNING_MODE !== 'BROWSER')
        return Response.json({ error: 'browser_signing_mode_required' }, { status: 409 });
    const idem = req.headers.get('x-idempotency-key');
    if (!idem || idem.length < 16 || idem.length > 128)
        return Response.json({ error: 'valid_x_idempotency_key_required' }, { status: 400 });
    let walletLease = null;
    let keepWalletLease = false;
    try {
        const body = await req.json();
        if (!body.wallet || !body.outputMint || body.amountUsdc === undefined)
            return Response.json({ error: 'wallet_outputMint_amountUsdc_required' }, { status: 400 });
        const wallet = new PublicKey(body.wallet).toBase58();
        if (!authorized(req, c, wallet))
            return Response.json({ error: 'wallet_auth_required' }, { status: 401 });
        const outputMint = new PublicKey(body.outputMint).toBase58();
        const store = new SupabaseEventStore(c);
        const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
        const existing = await store.getTradeByIdempotency(idem);
        if (existing) {
            if (existing.walletPublicKey !== wallet || existing.intent.walletPublicKey !== wallet)
                return Response.json({ error: 'WALLET_INTENT_MISMATCH' }, { status: 422 });
            if (existing.transaction && existing.requestId && ['TRANSACTION_BUILT', 'SIGNED', 'SUBMITTED', 'CONFIRMING', 'UNKNOWN', 'CONFIRMED', 'RECONCILED'].includes(existing.state)) {
                return new Response(json({ tradeId: existing.tradeId, requestId: existing.requestId, transaction: existing.transaction, quote: existing.quote, state: existing.state, replay: true }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
            }
            return Response.json({ error: 'IDEMPOTENCY_KEY_ALREADY_USED', state: existing.state }, { status: 409 });
        }
        const lockKey = `wallet:${wallet}`;
        const lockOwner = idem;
        if (!(await store.claimLease(lockKey, lockOwner, 120000)))
            return Response.json({ error: 'WALLET_EXECUTION_BUSY' }, { status: 409 });
        walletLease = { store, lockKey, tradeId: lockOwner };
        if (outputMint === USDC)
            return Response.json({ error: 'output_mint_must_differ_from_usdc' }, { status: 400 });
        const amount = parseUsdcAmount(body.amountUsdc);
        const maxPositionRaw = BigInt(Math.floor(c.MAX_POSITION_USD * 1e6));
        if (amount.raw > maxPositionRaw)
            return Response.json({ error: 'max_position_size_exceeded', maximumUsd: c.MAX_POSITION_USD }, { status: 422 });
        const amountUsdc = Number(amount.raw) / 1e6;
        const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
        const [inputValid, outputValid, token] = await Promise.all([
            validateMint(conn, USDC),
            validateMint(conn, outputMint),
            tokenInfo(c, outputMint),
        ]);
        if (!inputValid.valid || !outputValid.valid)
            return Response.json({ error: 'token_validation_failed', input: inputValid, output: outputValid }, { status: 422 });
        const tokenPolicy = await evaluateTokenPolicy(conn, outputValid, defaultTokenPolicy(c.BLACKLISTED_MINTS));
        if (!tokenPolicy.allowed)
            return Response.json({ error: 'token_policy_rejected', policy: tokenPolicy }, { status: 422 });
        if (Number(token.liquidity || 0) < c.MIN_LIQUIDITY_USD)
            return Response.json({ error: 'liquidity_too_low', liquidityUsd: Number(token.liquidity || 0), minimum: c.MIN_LIQUIDITY_USD }, { status: 422 });
        const riskState = await loadLiveRiskState(conn, c, new PublicKey(wallet), amountUsdc, outputMint, store);
        const j = new JupiterClient(c);
        const tradeId = randomUUID();
        const executionId = randomUUID();
        const order = await j.order(USDC, outputMint, amount.raw, wallet, c.MAX_SLIPPAGE_BPS);
        const now = Date.now();
        let decision;
        try {
            decision = await buildLiveDecisionContext(c, conn, order.quote, USDC, outputMint, c.INPUT_DECIMALS, c.OUTPUT_DECIMALS, now);
        }
        catch (e) {
            return Response.json({ error: 'MARKET_DATA_UNAVAILABLE', detail: e instanceof Error ? e.message : 'unknown' }, { status: 503 });
        }
        const market = decision.market;
        const signal = new ConservativeStrategy().evaluate(market, decision.context);
        if (signal.direction !== 'BUY')
            return Response.json({ error: 'STRATEGY_REJECTED', signal, calibrationSource: decision.calibrationSource }, { status: 422 });
        const approval = new RiskEngine(c).approve(signal, market, riskState);
        await replayLogger.record(makeReplayEvent({
            trade: { walletPublicKey: wallet, tradeId, signalId: signal.signalId, executionId, state: 'QUOTE_RECEIVED', createdAtMs: now, intent: { walletPublicKey: wallet, tradeId, signalId: signal.signalId, inputMint: USDC, outputMint, inputAmountRaw: amount.raw, expectedOutputRaw: order.quote.outAmount, maxSlippageBps: c.MAX_SLIPPAGE_BPS, timestampMs: now, riskApproved: approval.decision === 'APPROVE' }, quote: order.quote },
            wallet, quote: order.quote, eventType: 'QUOTE', side: 'BUY', executionLatencyMs: null, success: null, errorCode: null, actualSlippageBps: null, feeUsd: null, feeLamports: null,
            context: { market, risk: approval, riskState, token, strategy: { name: signal.strategyName, version: signal.strategyVersion, action: signal.direction, signalId: signal.signalId, probability: signal.probability, rawProbability: signal.rawProbability, calibrationStatus: signal.calibrationStatus, calibrationSource: signal.calibrationSource, taScore: signal.taScore, faScore: signal.faScore, marketQualityScore: signal.marketQualityScore, expectedValue: signal.expectedValue, entry: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, riskReward: signal.riskReward, sampleSize: signal.sampleSize, dataQuality: signal.dataQuality, regime: signal.regime, bullishReasons: signal.bullishReasons, bearishReasons: signal.bearishReasons, neutralReasons: signal.neutralReasons } }
        }));
        if (approval.decision !== 'APPROVE')
            return Response.json({ error: 'risk_rejected', approval }, { status: 422 });
        if (!order.transaction || !order.requestId)
            return Response.json({ error: 'jupiter_transaction_unavailable' }, { status: 503 });
        const inspection = await inspectTransaction(conn, order.transaction, c, USDC, outputMint, wallet, amount.raw, order.quote.minOutputAmount);
        if (!inspection.valid)
            return Response.json({ error: 'transaction_intent_rejected', inspection }, { status: 422 });
        // Simulate the exact unsigned transaction before the wallet sees the signing request.
        const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
        const simulation = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false, commitment: 'confirmed' });
        if (simulation.value.err)
            return Response.json({ error: 'transaction_simulation_failed', simulationError: simulation.value.err, logs: simulation.value.logs?.slice(-20) }, { status: 422 });
        const trade = {
            walletPublicKey: wallet,
            tradeId,
            signalId: signal.signalId,
            executionId,
            state: 'TRANSACTION_BUILT',
            createdAtMs: now,
            intent: {
                walletPublicKey: wallet,
                tradeId,
                signalId: signal.signalId,
                inputMint: USDC,
                outputMint,
                inputAmountRaw: amount.raw,
                expectedOutputRaw: order.quote.outAmount,
                maxSlippageBps: c.MAX_SLIPPAGE_BPS,
                timestampMs: now,
                riskApproved: true,
            },
            requestId: order.requestId,
            idempotencyKey: idem,
            quote: order.quote,
            transaction: order.transaction,
            positionId: tradeId,
            tradeSide: 'ENTRY',
        };
        const saved = await store.createOrGetTrade(trade);
        keepWalletLease = true;
        await store.append('browser_trade_prepared', { tradeId, wallet, outputMint, amountUsdc, approval, inspection, simulation: { err: simulation.value.err, unitsConsumed: simulation.value.unitsConsumed } });
        return new Response(json({
            tradeId: saved.tradeId,
            requestId: saved.requestId ?? order.requestId,
            transaction: saved.transaction ?? order.transaction,
            quote: saved.quote ?? order.quote,
            approval,
            inspection,
            simulation: { ok: true, unitsConsumed: simulation.value.unitsConsumed },
            output: { mint: outputMint, symbol: token.symbol, name: token.name, decimals: Number(token.decimals) },
            execution: { venue: 'Jupiter Swap API V2', walletSigning: 'browser', confirmationRequired: true },
        }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'prepare_trade_failed' }, { status: 500 });
    }
    finally {
        if (walletLease && !keepWalletLease) {
            try {
                await walletLease.store.releaseLease(walletLease.lockKey);
            }
            catch { /* best-effort cleanup; lease expiry is the fallback */ }
        }
    }
}
