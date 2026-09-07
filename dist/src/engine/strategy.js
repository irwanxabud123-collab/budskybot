import { id } from '../core/id.js';
import { computeTA, taScore } from './ta.js';
const DEFAULTS = { minSampleSize: 100, minProbability: 0.55, minExpectedValueUsd: 0, maxDataAgeMs: 5000, atrStopMultiple: 2, rewardRisk: 1.8, feeBps: 30, slippageBps: 50 };
const missingReason = (x) => `MISSING:${x}`;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function scoreTA(ta) { return ta ? taScore(ta) : null; }
function evidence(ta) {
    const bull = [], bear = [], neutral = [];
    if (!ta) {
        neutral.push(missingReason('TA_OHLCV'));
        return { bull, bear, neutral };
    }
    if (ta.trendAlignment.value === 1)
        bull.push('EMA trend alignment bullish');
    else if (ta.trendAlignment.value === -1)
        bear.push('EMA trend alignment bearish');
    else
        neutral.push('EMA trend alignment neutral');
    if (ta.rsi14.value !== null) {
        if (ta.rsi14.value > 55)
            bull.push('RSI momentum positive');
        else if (ta.rsi14.value < 45)
            bear.push('RSI momentum negative');
        else
            neutral.push('RSI momentum neutral');
    }
    else
        neutral.push(missingReason('RSI14'));
    if (ta.macdHistogram.value !== null) {
        if (ta.macdHistogram.value > 0)
            bull.push('MACD histogram positive');
        else if (ta.macdHistogram.value < 0)
            bear.push('MACD histogram negative');
    }
    if (ta.breakout.value === true)
        bull.push('Market structure breakout');
    if (ta.breakdown.value === true)
        bear.push('Market structure breakdown');
    if (ta.volatilityRegime.value === 'HIGH')
        neutral.push('High volatility regime');
    return { bull, bear, neutral };
}
function faScore(f) {
    if (!f)
        return null;
    const vals = [];
    if (typeof f.topHolderConcentrationPct === 'number' && Number.isFinite(f.topHolderConcentrationPct))
        vals.push(clamp(1 - f.topHolderConcentrationPct / 100) * 100);
    if (typeof f.liquidityUsd === 'number' && Number.isFinite(f.liquidityUsd) && f.liquidityUsd > 0)
        vals.push(Math.min(100, Math.log10(f.liquidityUsd) * 20));
    if (typeof f.marketCapUsd === 'number' && typeof f.liquidityUsd === 'number' && f.marketCapUsd > 0 && f.liquidityUsd > 0)
        vals.push(Math.min(100, (f.liquidityUsd / f.marketCapUsd) * 100 * 2));
    if (typeof f.fdvUsd === 'number' && typeof f.liquidityUsd === 'number' && f.fdvUsd > 0 && f.liquidityUsd > 0)
        vals.push(Math.min(100, (f.liquidityUsd / f.fdvUsd) * 100 * 2));
    if (f.mintAuthorityDisabled === true)
        vals.push(100);
    else if (f.mintAuthorityDisabled === false)
        vals.push(20);
    if (f.freezeAuthorityDisabled === true)
        vals.push(100);
    else if (f.freezeAuthorityDisabled === false)
        vals.push(20);
    if (typeof f.tokenAgeDays === 'number' && Number.isFinite(f.tokenAgeDays))
        vals.push(Math.min(100, Math.log10(Math.max(1, f.tokenAgeDays)) * 50));
    if (typeof f.newsScore === 'number')
        vals.push(clamp(f.newsScore) * 100);
    if (typeof f.socialScore === 'number')
        vals.push(clamp(f.socialScore) * 100);
    return vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function multiTimeframeScore(c) {
    const map = c.candlesByTimeframe;
    if (!map)
        return { ta: c.candles?.length ? computeTA(c.candles, c.nowMs) : null, score: c.candles?.length ? scoreTA(computeTA(c.candles, c.nowMs)) : null, regime: 'UNKNOWN', ...evidence(c.candles?.length ? computeTA(c.candles, c.nowMs) : null) };
    const ordered = ['4h', '1h', '15m', '5m'];
    const scored = [];
    for (const tf of ordered) {
        const cs = map[tf];
        if (cs && cs.length) {
            const t = computeTA(cs, c.nowMs);
            const s = scoreTA(t);
            if (s !== null)
                scored.push({ tf, ta: t, score: s });
        }
    }
    if (!scored.length)
        return { ta: null, score: null, regime: 'UNKNOWN', ...evidence(null) };
    const bull = [], bear = [], neutral = [];
    for (const x of scored) {
        const e = evidence(x.ta);
        bull.push(...e.bull.map(v => `${x.tf}: ${v}`));
        bear.push(...e.bear.map(v => `${x.tf}: ${v}`));
        neutral.push(...e.neutral.map(v => `${x.tf}: ${v}`));
    }
    const weights = { '4h': 0.4, '1h': 0.3, '15m': 0.2, '5m': 0.1 };
    let sw = 0, s = 0;
    for (const x of scored) {
        s += x.score * (weights[x.tf] ?? 0.1);
        sw += weights[x.tf] ?? 0.1;
    }
    const last = scored.find(x => x.tf === '5m')?.ta ?? scored.find(x => x.tf === '15m')?.ta ?? scored[0].ta;
    return { ta: last, score: sw ? s / sw : null, regime: last.volatilityRegime.value ?? 'UNKNOWN', bull, bear, neutral };
}
export class ConservativeStrategy {
    config;
    name = 'budsky-canonical-v9';
    version = 'budsky-v9.0.0';
    modelVersion = 'probability-v1';
    calibrationVersion = 'isotonic-v1';
    featureVersion = 'ta-fa-v1.1';
    constructor(config = DEFAULTS) {
        this.config = config;
    }
    evaluate(m, ctx = {}) {
        const now = ctx.nowMs ?? Date.now();
        const position = ctx.position ?? { side: 'NONE', quantityRaw: 0n };
        const mtf = multiTimeframeScore(ctx);
        const ta = mtf.ta;
        const taScoreValue = mtf.score;
        const evd = { bull: mtf.bull, bear: mtf.bear, neutral: mtf.neutral };
        const fa = faScore(ctx.fundamental);
        if (fa === null)
            evd.neutral.push(missingReason('FA_MINIMUM_EVIDENCE'));
        const quality = ctx.fundamental && fa !== null ? 'PARTIAL' : 'INSUFFICIENT';
        if (m.freshnessMs > this.config.maxDataAgeMs)
            evd.neutral.push('STALE_MARKET_DATA');
        const model = ctx.calibrationModel;
        const n = ctx.sampleSize ?? 0;
        const source = ctx.calibrationSource ?? 'NONE';
        const base = ctx.probabilityBaseRate ?? null;
        const regimeMultiplier = ctx.regimeMultiplier ?? null;
        const riskAdjustment = ctx.riskAdjustment ?? null;
        const raw = source === 'BACKTEST_SEED' ? (taScoreValue === null ? null : taScoreValue) : (taScoreValue === null || base === null || regimeMultiplier === null || riskAdjustment === null ? null : clamp(base * clamp(regimeMultiplier, 0.5, 1.5) * clamp(riskAdjustment, 0.5, 1.5) * (0.8 + taScoreValue / 250)));
        const usable = model !== undefined && n >= this.config.minSampleSize;
        const probability = raw !== null && usable && model ? clamp(model.predict(raw)) : null;
        const calibration = probability === null ? 'INSUFFICIENT_DATA' : 'CALIBRATED';
        const entry = m.entryPriceUsd ?? null;
        let stopLoss = null, takeProfit = null, rr = null, expectedValue = null;
        const atr = ta?.atr14.value ?? null;
        if (entry !== null && atr !== null && entry > 0 && atr > 0) {
            if (position.side === 'LONG' || position.side === 'NONE') {
                stopLoss = Math.max(0, entry - atr * this.config.atrStopMultiple);
                takeProfit = entry + atr * this.config.atrStopMultiple * this.config.rewardRisk;
            }
            else {
                stopLoss = entry + atr * this.config.atrStopMultiple;
                takeProfit = Math.max(0, entry - atr * this.config.atrStopMultiple * this.config.rewardRisk);
            }
            const risk = Math.abs(entry - stopLoss), reward = Math.abs(takeProfit - entry);
            rr = risk > 0 ? reward / risk : null;
            if (probability !== null && risk > 0) {
                const grossWin = reward, grossLoss = risk;
                const roundTripCosts = entry * (this.config.feeBps + this.config.slippageBps) / 10000;
                expectedValue = probability * grossWin - (1 - probability) * grossLoss - roundTripCosts;
            }
        }
        let direction = 'HOLD';
        const bullish = evd.bull.length > evd.bear.length, bearish = evd.bear.length > evd.bull.length;
        const tradable = probability !== null && expectedValue !== null && m.valid && m.freshnessMs <= this.config.maxDataAgeMs && ta !== null && atr !== null;
        if (position.side === 'NONE' && tradable && probability >= this.config.minProbability && bullish && expectedValue > this.config.minExpectedValueUsd)
            direction = 'BUY';
        else if (position.side === 'LONG' && tradable && (bearish || probability < this.config.minProbability || expectedValue < 0))
            direction = 'SELL';
        if (n < this.config.minSampleSize)
            evd.neutral.push(`CALIBRATION_SAMPLE_INSUFFICIENT:${n}<${this.config.minSampleSize}`);
        if (probability === null)
            evd.neutral.push('Probability is not calibrated');
        const marketQuality = Number.isFinite(m.estimatedLiquidityUsd) && m.estimatedLiquidityUsd > 0 ? Math.min(100, Math.log10(m.estimatedLiquidityUsd) * 20) : null;
        return { signalId: id('sig'), timestampMs: now, token: position.side === 'LONG' ? m.inputMint : m.outputMint, direction, disclaimer: 'Probabilistic model output, not a guarantee of profit. Crypto trading involves substantial risk of loss. Confidence is an estimated probability, not certainty.', entryReference: entry === null ? null : String(entry), confidence: probability, probability, rawProbability: raw, calibrationStatus: calibration, calibrationSource: source, taScore: taScoreValue, faScore: fa, marketQualityScore: marketQuality, riskScore: null, expectedValue, entryPrice: entry, stopLoss, takeProfit, riskReward: rr, strategyName: this.name, strategyVersion: this.version, modelVersion: this.modelVersion, calibrationVersion: this.calibrationVersion, featureVersion: this.featureVersion, reason: [...evd.bull, ...evd.bear, ...evd.neutral].join('; '), bullishReasons: evd.bull, bearishReasons: evd.bear, neutralReasons: evd.neutral, dataQuality: quality, sampleSize: n, regime: mtf.regime };
    }
}
