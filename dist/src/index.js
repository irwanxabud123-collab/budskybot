import { loadConfig } from './config/config.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { SupabaseEventStore } from './persistence/event-store.js';
import { JupiterClient } from './execution/jupiter.js';
import { ConservativeStrategy } from './engine/strategy.js';
import { RiskEngine } from './engine/risk.js';
import { ExecutionEngine } from './execution/execution-engine.js';
import { validateMint } from './security/token-validator.js';
import { logger } from './infra/logger.js';
import { loadCsv, runSimpleBacktest } from './engine/backtest.js';
import { loadLiveRiskState } from './engine/live-risk.js';
import { ReplayLogger } from './replay/logger.js';
import { makeReplayEvent } from './replay/runtime-event.js';
import { id } from './core/id.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { buildLiveDecisionContext } from './market-data/live-context.js';
import { reconcileUnknownTrades } from './execution/reconciliation-worker.js';
import { PaperBroker } from './engine/paper.js';
import { PaperTradingSession } from './engine/paper-session.js';
async function main() {
    let c;
    try {
        c = loadConfig();
    }
    catch (e) {
        console.error('CONFIG_INVALID', e);
        process.exitCode = 2;
        return;
    }
    const cmd = process.argv[2] ?? 'health';
    if (cmd === 'health') {
        const started = Date.now();
        let rpcOk = false, rpcError = null;
        try {
            await new Connection(c.RPC_URL, { commitment: 'confirmed' }).getLatestBlockhash('confirmed');
            rpcOk = true;
        }
        catch (e) {
            rpcError = e instanceof Error ? e.message : 'RPC_UNAVAILABLE';
        }
        const persistenceConfigured = Boolean(c.SUPABASE_URL && (c.SUPABASE_KEY || c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY));
        console.log(JSON.stringify({ ok: rpcOk && persistenceConfigured, mode: c.mode, network: c.NETWORK, liveEnabled: c.LIVE_ENABLED, emergencyStop: c.EMERGENCY_STOP, safeMode: c.mode !== 'LIVE' || !c.LIVE_ENABLED || c.EMERGENCY_STOP, persistenceConfigured, rpc: { ok: rpcOk, error: rpcError, latencyMs: Date.now() - started }, strategyVersion: 'budsky-v9.0.0' }, null, 2));
        return;
    }
    if (cmd === 'backtest') {
        const path = process.argv[3];
        if (!path) {
            console.error('BACKTEST_CSV_PATH_REQUIRED');
            process.exitCode = 2;
            return;
        }
        const candles = await loadCsv(path);
        const result = runSimpleBacktest(candles, 1000, 30, c.MAX_SLIPPAGE_BPS, { riskPerTradePct: 1, maxPositionUsd: c.MAX_POSITION_USD, maxTotalExposureUsd: c.MAX_TOTAL_EXPOSURE_USD });
        if (result.seedCalibration) {
            await mkdir(dirname(c.BACKTEST_SEED_PATH), { recursive: true });
            await writeFile(c.BACKTEST_SEED_PATH, JSON.stringify(result.seedCalibration, null, 2), 'utf8');
        }
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (cmd === 'reconcile-unknown') {
        const store = new SupabaseEventStore(c);
        const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
        const result = await reconcileUnknownTrades(conn, store);
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (cmd === 'paper:mainnet' && process.argv.includes('--paper-mainnet')) {
        if (c.MODE !== 'PAPER') {
            console.error('PAPER_MAINNET_BLOCKED: MODE must be PAPER');
            process.exitCode = 4;
            return;
        }
        if (c.NETWORK !== 'mainnet-beta') {
            console.error('PAPER_MAINNET_BLOCKED: NETWORK must be mainnet-beta');
            process.exitCode = 4;
            return;
        }
        console.log(JSON.stringify({ mode: 'PAPER', network: 'mainnet-beta', tradeAmountRaw: c.PAPER_MAINNET_TRADE_AMOUNT.toString(), tradeAmountUsdc: Number(c.PAPER_MAINNET_TRADE_AMOUNT) / 1e6, broadcast: false, status: 'RUNNING', walletPath: c.WALLET_PATH, note: 'Mainnet paper collector uses real Jupiter quotes only. It never signs or broadcasts real-money transactions.' }));
        let wallet = c.WALLET_PUBLIC_KEY;
        if (!wallet && c.WALLET_PATH) {
            try {
                const raw = JSON.parse(await readFile(c.WALLET_PATH, 'utf8'));
                const bytes = Array.isArray(raw) ? Uint8Array.from(raw) : Uint8Array.from(raw.secretKey ?? []);
                if (bytes.length === 64)
                    wallet = Keypair.fromSecretKey(bytes).publicKey.toBase58();
            }
            catch (e) {
                console.error('PAPER_MAINNET_WALLET_READ_ERROR', e instanceof Error ? e.message : 'unknown');
                process.exitCode = 6;
                return;
            }
        }
        if (!wallet) {
            console.error('PAPER_MAINNET_BLOCKED: WALLET_PUBLIC_KEY or a valid WALLET_PATH is required for quote attribution');
            process.exitCode = 6;
            return;
        }
        const logger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: new SupabaseEventStore(c) });
        const intervalMs = Math.max(5000, Number(process.env.PAPER_INTERVAL_MS || 30000));
        const once = async () => {
            const j = new JupiterClient(c);
            const q = await j.order(c.OUTPUT_MINT, c.INPUT_MINT, c.PAPER_MAINNET_TRADE_AMOUNT, wallet, c.MAX_SLIPPAGE_BPS);
            const now = Date.now();
            const tradeId = id('paper-mainnet');
            const signalId = id('sig');
            const decision = await buildLiveDecisionContext(c, new Connection(c.RPC_URL, { commitment: 'confirmed' }), q.quote, c.OUTPUT_MINT, c.INPUT_MINT, c.OUTPUT_DECIMALS, c.INPUT_DECIMALS, now, c.OUTPUT_MINT);
            const market = decision.market;
            const signal = new ConservativeStrategy().evaluate(market, decision.context);
            const trade = { walletPublicKey: wallet, tradeId, signalId, executionId: id('exec'), state: 'QUOTE_RECEIVED', createdAtMs: now, intent: { walletPublicKey: wallet, tradeId, signalId, inputMint: c.OUTPUT_MINT, outputMint: c.INPUT_MINT, inputAmountRaw: c.PAPER_MAINNET_TRADE_AMOUNT, expectedOutputRaw: q.quote.outAmount, maxSlippageBps: c.MAX_SLIPPAGE_BPS, timestampMs: now, riskApproved: true }, quote: q.quote, positionId: tradeId, tradeSide: 'ENTRY' };
            await logger.record(makeReplayEvent({ trade, wallet, quote: q.quote, eventType: 'QUOTE', side: signal.direction, executionLatencyMs: null, success: true, errorCode: null, actualSlippageBps: null, feeUsd: null, feeLamports: null, context: { market, strategy: { name: signal.strategyName, version: signal.strategyVersion, action: signal.direction, signalId: signal.signalId } } }));
            console.log(JSON.stringify({ timestamp_ms: now, signal: signal.direction, input_usdc: Number(c.PAPER_MAINNET_TRADE_AMOUNT) / 1e6, quoted_output_raw: q.quote.outAmount.toString(), priceImpactPct: q.quote.priceImpactPct }));
        };
        while (true) {
            try {
                await once();
            }
            catch (e) {
                console.error('PAPER_MAINNET_QUOTE_ERROR', e instanceof Error ? e.message : 'unknown');
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
    }
    if (cmd === 'paper' && process.argv.includes('--paper')) {
        if (c.MODE !== 'PAPER') {
            console.error('PAPER_BLOCKED: MODE must be PAPER');
            process.exitCode = 4;
            return;
        }
        const logger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: new SupabaseEventStore(c) });
        const broker = new PaperBroker();
        const session = new PaperTradingSession(broker, logger, c.WALLET_PUBLIC_KEY || 'PAPER', c.INPUT_DECIMALS, c.OUTPUT_DECIMALS);
        const intervalMs = Math.max(5000, Number(process.env.PAPER_INTERVAL_MS || 30000));
        console.log(JSON.stringify({ mode: 'PAPER', pair: `${c.INPUT_MINT}/${c.OUTPUT_MINT}`, intervalMs, status: 'RUNNING', broadcast: false, note: 'Paper mode executes virtual fills from real-time Jupiter quotes; no signing or broadcast. PAPER_SIMULATED P&L is not LIVE_REPLAY evidence.' }));
        const once = async () => {
            const j = new JupiterClient(c);
            const inputMint = session.hasPosition() ? c.OUTPUT_MINT : c.INPUT_MINT;
            const outputMint = session.hasPosition() ? c.INPUT_MINT : c.OUTPUT_MINT;
            const inputDecimals = session.hasPosition() ? c.OUTPUT_DECIMALS : c.INPUT_DECIMALS;
            const outputDecimals = session.hasPosition() ? c.INPUT_DECIMALS : c.OUTPUT_DECIMALS;
            const amount = session.hasPosition() ? session.getPosition().entry.outputAmountRaw : c.TRADE_AMOUNT;
            const q = await j.order(inputMint, outputMint, amount, c.WALLET_PUBLIC_KEY || '', c.MAX_SLIPPAGE_BPS);
            const now = Date.now();
            const decision = await buildLiveDecisionContext(c, new Connection(c.RPC_URL, { commitment: 'confirmed' }), q.quote, inputMint, outputMint, inputDecimals, outputDecimals, now, c.OUTPUT_MINT);
            const signal = new ConservativeStrategy().evaluate(decision.market, { ...decision.context, position: session.hasPosition() ? { side: 'LONG', quantityRaw: session.getPosition().entry.outputAmountRaw, entryPrice: decision.market.entryPriceUsd } : { side: 'NONE', quantityRaw: 0n } });
            const result = await session.apply(signal, decision.market, q.quote);
            console.log(JSON.stringify({ timestamp_ms: now, signal: signal.direction, calibrationSource: signal.calibrationSource, action: result.action, pnlUsd: result.pnlUsd, quoteIn: q.quote.inAmount.toString(), quoteOut: q.quote.outAmount.toString(), broadcast: false }));
        };
        while (true) {
            try {
                await once();
            }
            catch (e) {
                console.error('PAPER_QUOTE_ERROR', e instanceof Error ? e.message : 'unknown');
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
    }
    if (!['paper', 'dry-run', 'live'].includes(cmd)) {
        console.error('UNKNOWN_COMMAND');
        process.exitCode = 2;
        return;
    }
    const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
    const [input, output] = await Promise.all([validateMint(conn, c.INPUT_MINT), validateMint(conn, c.OUTPUT_MINT)]);
    if (!input.valid || !output.valid) {
        console.error(JSON.stringify({ status: 'SAFE_MODE', reason: 'TOKEN_VALIDATION_FAILED', input, output }));
        process.exitCode = 3;
        return;
    }
    if (!c.WALLET_PUBLIC_KEY) {
        console.error('SAFE_MODE: WALLET_PUBLIC_KEY is required; no fabricated balance/risk state is permitted.');
        process.exitCode = 6;
        return;
    }
    const wallet = new PublicKey(c.WALLET_PUBLIC_KEY);
    const store = new SupabaseEventStore(c), j = new JupiterClient(c), quote = await j.order(c.INPUT_MINT, c.OUTPUT_MINT, c.TRADE_AMOUNT, wallet.toBase58(), c.MAX_SLIPPAGE_BPS);
    const decision = await buildLiveDecisionContext(c, conn, quote.quote, c.INPUT_MINT, c.OUTPUT_MINT, c.INPUT_DECIMALS, c.OUTPUT_DECIMALS, Date.now());
    const market = decision.market;
    const riskState = await loadLiveRiskState(conn, c, wallet, Number(c.TRADE_AMOUNT) / 10 ** c.INPUT_DECIMALS, c.OUTPUT_MINT, store);
    const signal = new ConservativeStrategy().evaluate(market, decision.context);
    const approval = new RiskEngine(c).approve(signal, market, riskState);
    if (cmd === 'live') {
        console.error('LIVE_BLOCKED: CLI server-side keypair signing is disabled; integrate a non-exportable KMS/HSM signer before enabling server LIVE.');
        process.exitCode = 5;
        return;
    }
    const engine = new ExecutionEngine(c, j, store, undefined, conn);
    const key = `cli-${cmd}-${Date.now()}-${crypto.randomUUID()}`;
    const trade = await engine.execute(signal, market, approval, key, quote, riskState);
    console.log(JSON.stringify({ signal, risk: approval, trade }, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
main().catch(e => { logger.error({ err: e }, 'fatal'); process.exitCode = 1; });
