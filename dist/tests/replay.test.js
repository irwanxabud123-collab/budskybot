import { describe, expect, it } from 'vitest';
import { runValidation, simulateExecution } from '../src/replay/replayEngine.js';
import { PaperBroker } from '../src/engine/paper.js';
import { runSimpleBacktest } from '../src/engine/backtest.js';
const event = (overrides = {}) => ({
    schema_version: '2.0.0', event_id: '00000000-0000-4000-8000-000000000001', timestamp_ms: 1, trade_id: 't1', position_id: null, pair: 'SOL/USDC', side: 'BUY', event_type: 'EXECUTION',
    market_snapshot: { bid: null, ask: null, mid: null, spread_bps: null, source: null, provenance: 'MISSING' },
    jupiter_quote: { inAmount: '1000000', outAmount: '100', minOutputAmount: '99', slippageBps: 50, priceImpactPct: 0.2, route: [], routePlan: [], requestId: 'r1', quotedAtMs: 1, provenance: 'OBSERVED' },
    liquidity: { poolTVL: null, depth_1pct: null, source: null, provenance: 'MISSING' }, token_data: { volatility_1h: null, volatility_24h: null, source: null, provenance: 'MISSING' },
    risk_engine: { maxPosition: 100, riskScore: null, decision: 'APPROVE', reason: null, provenance: 'OBSERVED' }, execution: { latency_ms: 100, slippage_bps: 5, fee_usd: 0.01, fee_lamports: 5000, success: true, error_code: null, signature: 'sig', confirmation_status: 'confirmed', provenance: 'OBSERVED' },
    pnl: { gross_pnl_usd: 2, net_pnl_usd: 1.9, notional_usd: 100, provenance: 'OBSERVED' }, strategy: null, position: { entry_price: null, entry_fee: null, entry_slippage: null, exit_price: null, exit_fee: null, exit_slippage: null, realized_gross_pnl: null, realized_net_pnl: null, unrealized_pnl: null, tx_signature: null, provenance: 'MISSING' }, raw: { quote: null, token: null, simulation: null, chain_meta: null }, ...overrides
});
describe('replay data integrity', () => {
    it('does not fabricate missing execution data', () => { const e = event({ execution: { latency_ms: null, slippage_bps: null, fee_usd: null, fee_lamports: null, success: null, error_code: null, signature: null, confirmation_status: null, provenance: 'MISSING' } }); const r = runValidation([e]); expect(r.status).toBe('NEED LIVE DATA'); expect(r.stress.failedTx5pct.netPnlUsd).toBeNull(); });
    it('never uses future price-impact observations', () => { const target = event({ timestamp_ms: 10, jupiter_quote: { ...event().jupiter_quote, priceImpactPct: null }, liquidity: { ...event().liquidity, depth_1pct: 100, provenance: 'OBSERVED' }, pnl: { ...event().pnl, notional_usd: 100 } }); const future = event({ timestamp_ms: 20, liquidity: { ...event().liquidity, depth_1pct: 200, provenance: 'OBSERVED' }, jupiter_quote: { ...event().jupiter_quote, priceImpactPct: 9 }, pnl: { ...event().pnl, notional_usd: 100 } }); expect(simulateExecution(target, [future], { feeMultiplier: 1, additionalSlippageBps: 0, slippageMultiplier: 1, additionalLatencyMs: 0, failedTxRate: 0 }).priceImpactPct).toBeNull(); });
    it('paper broker has no hidden fee/slippage defaults', () => { const fill = new PaperBroker().fill({ signalId: 's', timestampMs: 1, token: 'x', direction: 'BUY', disclaimer: 'test', entryReference: '1', confidence: 0, strategyName: 'test', strategyVersion: '1', modelVersion: 'test', calibrationVersion: 'test', featureVersion: 'test', reason: 'test', probability: 0, rawProbability: 0, calibrationStatus: 'INSUFFICIENT_DATA', calibrationSource: 'NONE', taScore: null, faScore: null, marketQualityScore: null, riskScore: null, expectedValue: null, entryPrice: null, stopLoss: null, takeProfit: null, riskReward: null, bullishReasons: [], bearishReasons: [], neutralReasons: [], dataQuality: 'PARTIAL', sampleSize: 0, regime: 'UNKNOWN' }, { inputMint: 'a', outputMint: 'b', inputAmountRaw: 100n, expectedOutputRaw: 1000n, timestampMs: 1, source: 'test', freshnessMs: 0, valid: true, priceImpactPct: 0, estimatedLiquidityUsd: 100 }); expect(fill.feeRaw).toBeNull(); expect(fill.slippageBps).toBeNull(); expect(fill.outputAmountRaw).toBe(1000n); });
});
describe('backtest calibration bootstrap', () => {
    it('uses risk sizing and labels seed outcomes with ATR exits', () => {
        const candles = Array.from({ length: 320 }, (_, i) => {
            const close = 1 + i * 0.002;
            return { timestampMs: 1_700_000_000_000 + i * 300_000, open: close, high: close * 1.003, low: close * 0.997, close, volume: 1000 };
        });
        const result = runSimpleBacktest(candles, 1000, 30, 50, { riskPerTradePct: 1, maxPositionUsd: 100, maxTotalExposureUsd: 200 });
        expect(result.metricPeriod).toBe('PER_TRADE_NOT_ANNUALIZED');
        expect(result.riskPerTradePct).toBe(1);
        expect(result.maxPositionUsd).toBe(100);
        expect(result.maxTotalExposureUsd).toBe(200);
        expect(result.limitations.join(' ')).toContain('seed');
        expect(result.seedCalibration?.source).toBe('BACKTEST_SEED');
        expect(result.seedCalibration?.trainingSamples).toBeGreaterThan(0);
        expect(result.tradesDetail.every(t => t.signal === 'BUY')).toBe(true);
    });
});
