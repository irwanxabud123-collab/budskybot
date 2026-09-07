export class RiskEngine {
    c;
    constructor(c) {
        this.c = c;
    }
    approve(signal, m, s) {
        const fail = (reason) => ({ decision: 'REJECT', reason: `RISK_REJECTED:${reason}`, checkedAtMs: Date.now() });
        if (signal.direction === 'HOLD')
            return fail('HOLD_SIGNAL');
        if (signal.probability === null || signal.calibrationStatus !== 'CALIBRATED')
            return fail('PROBABILITY_NOT_CALIBRATED');
        if (signal.calibrationSource === 'BACKTEST_SEED' && this.c.mode === 'LIVE') {
            if (!this.c.ALLOW_BACKTEST_SEED_LIVE)
                return fail('BACKTEST_SEED_LIVE_NOT_ENABLED');
            if (s.requestedPositionUsd > this.c.BACKTEST_SEED_MAX_POSITION_USD)
                return fail('BACKTEST_SEED_POSITION_CAP_EXCEEDED');
        }
        if (signal.calibrationSource === 'PAPER_REPLAY' && this.c.mode === 'LIVE') {
            if (!this.c.ALLOW_PAPER_REPLAY_LIVE)
                return fail('PAPER_REPLAY_LIVE_NOT_ENABLED');
            if (s.requestedPositionUsd > this.c.PAPER_REPLAY_MAX_POSITION_USD)
                return fail('PAPER_REPLAY_POSITION_CAP_EXCEEDED');
        }
        if (signal.direction === 'BUY' && (signal.expectedValue === null || signal.expectedValue <= 0))
            return fail('NON_POSITIVE_EXPECTED_VALUE');
        if (signal.entryPrice === null || signal.stopLoss === null || signal.takeProfit === null || signal.riskReward === null)
            return fail('SL_TP_MISSING');
        if (!s.riskStateFresh)
            return fail('RISK_STATE_UNKNOWN');
        if (!m.valid)
            return fail('MARKET_DATA_INVALID');
        if (!Number.isFinite(m.priceImpactPct) || !Number.isFinite(m.estimatedLiquidityUsd))
            return fail('MARKET_NUMERIC_INVALID');
        if (m.freshnessMs > this.c.MAX_MARKET_DATA_AGE_MS)
            return fail('STALE_MARKET_DATA');
        if (m.candleFreshnessMs !== undefined && m.candleFreshnessMs > this.c.MAX_CANDLE_DATA_AGE_MS)
            return fail('STALE_CANDLE_DATA');
        if (m.priceImpactPct > this.c.MAX_PRICE_IMPACT_PCT)
            return fail('PRICE_IMPACT_TOO_HIGH');
        if (m.estimatedLiquidityUsd < this.c.MIN_LIQUIDITY_USD)
            return fail('LIQUIDITY_TOO_LOW');
        if (s.requestedPositionUsd > this.c.MAX_POSITION_USD)
            return fail('MAX_POSITION_SIZE_EXCEEDED');
        if (s.totalExposureUsd + s.requestedPositionUsd > this.c.MAX_TOTAL_EXPOSURE_USD)
            return fail('MAX_TOTAL_EXPOSURE_EXCEEDED');
        if (s.tokenExposureUsd + s.requestedPositionUsd > this.c.MAX_TOKEN_EXPOSURE_USD)
            return fail('MAX_TOKEN_EXPOSURE_EXCEEDED');
        if (s.dailyLossUsd >= this.c.MAX_DAILY_LOSS_USD)
            return fail('MAX_DAILY_LOSS_EXCEEDED');
        if (s.drawdownUsd >= this.c.MAX_DRAWDOWN_USD)
            return fail('MAX_DRAWDOWN_EXCEEDED');
        if (s.failedTrades >= this.c.MAX_FAILED_TRADES)
            return fail('MAX_FAILED_TRADES_EXCEEDED');
        if (s.consecutiveLosses >= this.c.MAX_CONSECUTIVE_LOSSES)
            return fail('MAX_CONSECUTIVE_LOSSES_EXCEEDED');
        if (s.walletUsdcUsd + 1e-9 < s.requestedPositionUsd)
            return fail('INSUFFICIENT_USDC_BALANCE');
        if (s.walletSolLamports < this.c.MIN_SOL_RESERVE_LAMPORTS)
            return fail('MIN_SOL_RESERVE_NOT_MET');
        if (s.lastTradeAtMs > 0 && Date.now() - s.lastTradeAtMs < this.c.TRADE_COOLDOWN_MS)
            return fail('COOLDOWN_ACTIVE');
        return { decision: 'APPROVE', reason: 'RISK_APPROVED', checkedAtMs: Date.now() };
    }
    approveExit(m, s) {
        const fail = (reason) => ({ decision: 'REJECT', reason: `RISK_REJECTED:${reason}`, checkedAtMs: Date.now() });
        if (!s.riskStateFresh)
            return fail('RISK_STATE_UNKNOWN');
        if (!m.valid)
            return fail('MARKET_DATA_INVALID');
        if (!Number.isFinite(m.priceImpactPct) || m.priceImpactPct > this.c.MAX_PRICE_IMPACT_PCT)
            return fail('PRICE_IMPACT_TOO_HIGH');
        if (!Number.isFinite(m.estimatedLiquidityUsd) || m.estimatedLiquidityUsd < this.c.MIN_LIQUIDITY_USD)
            return fail('LIQUIDITY_TOO_LOW');
        if (m.freshnessMs > this.c.MAX_QUOTE_AGE_MS)
            return fail('STALE_EXIT_QUOTE');
        if (s.walletSolLamports < this.c.MIN_SOL_RESERVE_LAMPORTS)
            return fail('MIN_SOL_RESERVE_NOT_MET');
        return { decision: 'APPROVE', reason: 'EXIT_RISK_APPROVED', checkedAtMs: Date.now() };
    }
}
