import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../src/engine/risk.js';
import type { MarketSnapshot, Signal, RiskState } from '../src/domain/types.js';

const c: any = {
  MAX_MARKET_DATA_AGE_MS: 1000,
  MAX_PRICE_IMPACT_PCT: 1,
  MIN_LIQUIDITY_USD: 1000,
  MAX_POSITION_USD: 25,
  MAX_TOTAL_EXPOSURE_USD: 100,
  MAX_TOKEN_EXPOSURE_USD: 50,
  MAX_DAILY_LOSS_USD: 20,
  MAX_DRAWDOWN_USD: 30,
  MAX_FAILED_TRADES: 2,
  MAX_CONSECUTIVE_LOSSES: 2,
  TRADE_COOLDOWN_MS: 1000,
  MIN_SOL_RESERVE_LAMPORTS: 10_000_000n,
};
const m: MarketSnapshot = { inputMint: 'A'.repeat(32), outputMint: 'B'.repeat(32), inputAmountRaw: 1n, expectedOutputRaw: 1n, timestampMs: Date.now(), source: 'test', freshnessMs: 0, valid: true, priceImpactPct: 0.1, estimatedLiquidityUsd: 5000 };
const s: Signal = { disclaimer: 'test', signalId: 's', timestampMs: Date.now(), token: 'B', direction: 'BUY', entryReference: '1', confidence: 1, strategyName: 't', strategyVersion: '1', modelVersion:'t', calibrationVersion:'t', featureVersion:'t', reason: 't', probability:1, rawProbability:1, calibrationStatus:'CALIBRATED', calibrationSource:'LIVE_REPLAY', taScore:50, faScore:null, marketQualityScore:50, riskScore:50, expectedValue:1, entryPrice:1, stopLoss:0.9, takeProfit:1.2, riskReward:2, bullishReasons:[], bearishReasons:[], neutralReasons:[], dataQuality:'COMPLETE', sampleSize:100, regime:'NORMAL' };
const state = (overrides: Partial<RiskState> = {}): RiskState => ({ totalExposureUsd: 0, tokenExposureUsd: 0, dailyLossUsd: 0, drawdownUsd: 0, failedTrades: 0, consecutiveLosses: 0, lastTradeAtMs: 0, requestedPositionUsd: 10, walletUsdcUsd: 100, walletSolLamports: 1_000_000_000n, riskStateFresh: true, ...overrides });

describe('RiskEngine', () => {
  it('approves safe trade', () => expect(new RiskEngine(c).approve(s, m, state()).decision).toBe('APPROVE'));
  it('rejects stale data', () => expect(new RiskEngine(c).approve(s, { ...m, freshnessMs: 1001 }, state()).reason).toContain('STALE'));
  it('rejects excessive impact', () => expect(new RiskEngine(c).approve(s, { ...m, priceImpactPct: 2 }, state()).reason).toContain('PRICE_IMPACT'));
  it('rejects an oversized position', () => expect(new RiskEngine(c).approve(s, m, state({ requestedPositionUsd: 26 })).reason).toContain('MAX_POSITION'));
  it('rejects unknown risk state', () => expect(new RiskEngine(c).approve(s, m, state({ riskStateFresh: false })).reason).toContain('RISK_STATE_UNKNOWN'));
  it('rejects PAPER_REPLAY in LIVE unless explicitly enabled', () => {
    const paperSignal = {...s, calibrationSource:'PAPER_REPLAY' as const};
    const liveConfig = {...c, mode:'LIVE', ALLOW_PAPER_REPLAY_LIVE:false, PAPER_REPLAY_MAX_POSITION_USD:5};
    expect(new RiskEngine(liveConfig).approve(paperSignal,m,state()).reason).toContain('PAPER_REPLAY_LIVE_NOT_ENABLED');
  });
  it('rejects insufficient reserve', () => expect(new RiskEngine(c).approve(s, m, state({ walletSolLamports: 1n })).reason).toContain('MIN_SOL_RESERVE'));
});
