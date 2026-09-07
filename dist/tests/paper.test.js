import { describe, it, expect } from 'vitest';
import { PaperBroker } from '../src/engine/paper.js';
import { PaperTradingSession } from '../src/engine/paper-session.js';
import { loadCalibrationFromEvents, loadPaperCalibrationFromEvents } from '../src/engine/calibration-store.js';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TOKEN = 'Token111111111111111111111111111111111111111';
const signal = (direction) => ({ signalId: `sig-${direction}`, timestampMs: Date.now(), token: TOKEN, direction, disclaimer: 'test', entryReference: '1', confidence: .8, probability: .8, rawProbability: .8, calibrationStatus: 'CALIBRATED', calibrationSource: 'PAPER_REPLAY', taScore: 70, faScore: 70, marketQualityScore: 70, riskScore: 70, expectedValue: 1, entryPrice: 1, stopLoss: .9, takeProfit: 1.2, riskReward: 2, strategyName: 'test', strategyVersion: 'budsky-v9.0.0', modelVersion: 'test', calibrationVersion: 'test', featureVersion: 'ta-fa-v1.1', reason: 'test', bullishReasons: [], bearishReasons: [], neutralReasons: [], dataQuality: 'COMPLETE', sampleSize: 100, regime: 'NORMAL' });
const quote = (inputMint, outputMint, inAmount, outAmount) => ({ inputMint, outputMint, inAmount, outAmount, minOutputAmount: outAmount, slippageBps: 50, priceImpactPct: 0.1, timestampMs: Date.now(), raw: {} });
const market = (inputMint, outputMint, inputAmountRaw, expectedOutputRaw) => ({ inputMint, outputMint, inputAmountRaw, expectedOutputRaw, timestampMs: Date.now(), source: 'JUPITER_TEST', freshnessMs: 0, candleFreshnessMs: 0, valid: true, priceImpactPct: .1, estimatedLiquidityUsd: 100000, entryPriceUsd: 1 });
const logger = { events: [], record: async function (e) { this.events.push(e); } };
describe('PaperTradingSession', () => {
    it('opens and closes a virtual position from signal direction', async () => {
        logger.events = [];
        const session = new PaperTradingSession(new PaperBroker(), logger, 'paper', 6, 6);
        const openM = market(USDC, TOKEN, 100000000n, 10000000n);
        const openQ = quote(USDC, TOKEN, 100000000n, 10000000n);
        expect((await session.apply(signal('BUY'), openM, openQ)).action).toBe('OPEN');
        expect(session.hasPosition()).toBe(true);
        const closeM = market(TOKEN, USDC, 10000000n, 110000000n);
        const closeQ = quote(TOKEN, USDC, 10000000n, 110000000n);
        const result = await session.apply(signal('SELL'), closeM, closeQ);
        expect(result.action).toBe('CLOSE');
        expect(result.pnlUsd).toBe(10);
        expect(session.hasPosition()).toBe(false);
        expect(logger.events.map((e) => e.event_type)).toEqual(['POSITION_OPEN', 'POSITION_CLOSE']);
        expect(logger.events.every((e) => e.execution_mode === 'PAPER_SIMULATED')).toBe(true);
    });
    it('uses broker fills to derive P&L, including observed fee/slippage model', () => {
        const broker = new PaperBroker({ feeBps: 30, slippageBps: 100 });
        const pos = broker.open('p', signal('BUY'), market(USDC, TOKEN, 100000000n, 10000000n), 6, 6);
        const closed = broker.close(pos, signal('SELL'), market(TOKEN, USDC, pos.entry.outputAmountRaw, 110000000n), 6, 6);
        expect(pos.entry.outputAmountRaw).toBe(9900000n);
        expect(closed.exit.outputAmountRaw).toBe(110000000n - 1100000n);
        expect(closed.grossPnlUsd).toBeCloseTo(8.9, 8);
        expect(closed.entryFeeUsd).toBeCloseTo(0.3, 8);
        expect(closed.exitFeeUsd).toBeCloseTo(0.3267, 8);
        expect(closed.netPnlUsd).toBeCloseTo(8.2733, 8);
    });
});
describe('paper calibration isolation', () => {
    const base = (mode, i) => { const pnl = mode === 'ON_CHAIN' ? 1 : -1; return { execution_mode: mode, event_type: 'POSITION_CLOSE', timestamp_ms: i + 1, strategy: { raw_probability: .55 + (i % 10) / 100, regime: 'NORMAL' }, pnl: { net_pnl_usd: pnl }, position: { provenance: 'DERIVED', realized_net_pnl: pnl } }; };
    it('never admits PAPER_SIMULATED rows into LIVE_REPLAY, even when mixed', () => {
        const mixed = [...Array.from({ length: 150 }, (_, i) => base('PAPER_SIMULATED', i)), ...Array.from({ length: 150 }, (_, i) => base('ON_CHAIN', 1000 + i))];
        const live = loadCalibrationFromEvents(mixed, 100);
        const paper = loadPaperCalibrationFromEvents(mixed, 100);
        expect(live.status).toBe('CALIBRATED');
        expect(live.source).toBe('LIVE_REPLAY');
        expect(live.sampleSize).toBe(105);
        expect(live.baseWinRate).toBe(1);
        expect(paper.status).toBe('CALIBRATED');
        expect(paper.source).toBe('PAPER_REPLAY');
        expect(paper.sampleSize).toBe(105);
        expect(paper.baseWinRate).toBe(0);
        expect(live.sampleSize).not.toBe(200);
    });
});
