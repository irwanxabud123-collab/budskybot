import { loadConfig } from '../../src/config/config.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { JupiterClient } from '../../src/execution/jupiter.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { ConservativeStrategy } from '../../src/engine/strategy.js';
import { RiskEngine } from '../../src/engine/risk.js';
import { ExecutionEngine } from '../../src/execution/execution-engine.js';
import { validateMint } from '../../src/security/token-validator.js';
import { authorized } from '../../src/api/auth.js';
import { loadLiveRiskState } from '../../src/engine/live-risk.js';
import { buildLiveDecisionContext } from '../../src/market-data/live-context.js';
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
    if (!authorized(req, c))
        return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (c.mode === 'LIVE')
        return Response.json({ error: 'wrong_endpoint_for_live' }, { status: 409 });
    if (!c.WALLET_PUBLIC_KEY)
        return Response.json({ error: 'WALLET_PUBLIC_KEY_REQUIRED_FOR_REAL_RISK_SNAPSHOT' }, { status: 422 });
    try {
        const wallet = new PublicKey(c.WALLET_PUBLIC_KEY);
        const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
        const [input, output] = await Promise.all([validateMint(conn, c.INPUT_MINT), validateMint(conn, c.OUTPUT_MINT)]);
        if (!input.valid || !output.valid)
            return Response.json({ error: 'token_validation_failed', input, output }, { status: 422 });
        const j = new JupiterClient(c), store = new SupabaseEventStore(c), quote = await j.order(c.INPUT_MINT, c.OUTPUT_MINT, c.TRADE_AMOUNT, wallet.toBase58(), c.MAX_SLIPPAGE_BPS);
        const now = Date.now();
        const decision = await buildLiveDecisionContext(c, conn, quote.quote, c.INPUT_MINT, c.OUTPUT_MINT, c.INPUT_DECIMALS, c.OUTPUT_DECIMALS, now);
        const market = decision.market;
        const riskState = await loadLiveRiskState(conn, c, wallet, Number(c.TRADE_AMOUNT) / 10 ** c.INPUT_DECIMALS, c.OUTPUT_MINT, store);
        const signal = new ConservativeStrategy().evaluate(market, decision.context), approval = new RiskEngine(c).approve(signal, market, riskState);
        const engine = new ExecutionEngine(c, j, store);
        const key = req.headers.get('x-idempotency-key') || crypto.randomUUID();
        const trade = await engine.execute(signal, market, approval, key, quote, riskState);
        return new Response(JSON.stringify({ signal, risk: approval, trade }, (_, v) => typeof v === 'bigint' ? v.toString() : v), { status: trade.state === 'QUOTE_VALIDATED' ? 200 : 202, headers: { 'content-type': 'application/json' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'execution_failed' }, { status: 500 });
    }
}
