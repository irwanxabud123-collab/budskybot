const missing = () => ({ value: null, source: null, timestampMs: null, provenance: 'MISSING' });
const derived = (value, ts) => ({ value, source: 'OHLCV_DERIVED', timestampMs: ts, provenance: 'DERIVED' });
function ema(values, period) { if (values.length < period)
    return null; const k = 2 / (period + 1); let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period; for (const v of values.slice(period))
    e = v * k + e * (1 - k); return e; }
function rsi(values, period) { if (values.length < period + 1)
    return null; let gain = 0, loss = 0; for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0)
        gain += d;
    else
        loss -= d;
} if (loss === 0)
    return 100; const rs = (gain / period) / (loss / period); return 100 - 100 / (1 + rs); }
function atr(c, period) { if (c.length < period + 1)
    return null; let s = 0; for (let i = c.length - period; i < c.length; i++) {
    const x = c[i], p = c[i - 1];
    s += Math.max(x.high - x.low, Math.abs(x.high - p.close), Math.abs(x.low - p.close));
} return s / period; }
function slope(values, lookback) { if (values.length < lookback)
    return null; const xs = Array.from({ length: lookback }, (_, i) => i); const ys = values.slice(-lookback); const xm = (lookback - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / lookback; let n = 0, d = 0; for (let i = 0; i < lookback; i++) {
    n += (xs[i] - xm) * (ys[i] - ym);
    d += (xs[i] - xm) ** 2;
} return d ? n / d : null; }
export function computeTA(candles, nowMs = candles.at(-1)?.timestampMs ?? Date.now()) {
    const close = candles.map(x => x.close), volume = candles.map(x => x.volume);
    const e9 = ema(close, 9), e21 = ema(close, 21), e50 = ema(close, 50), e200 = ema(close, 200);
    const r = rsi(close, 14);
    const e12 = ema(close, 12), e26 = ema(close, 26);
    const macd = e12 !== null && e26 !== null ? e12 - e26 : null;
    const macdSeries = [];
    for (let i = 0; i < close.length; i++) {
        const a = ema(close.slice(0, i + 1), 12), b = ema(close.slice(0, i + 1), 26);
        if (a !== null && b !== null)
            macdSeries.push(a - b);
    }
    const ms = ema(macdSeries, 9);
    const hist = macd !== null && ms !== null ? macd - ms : null;
    const a = atr(candles, 14);
    const price = close.at(-1) ?? 0;
    const natr = a !== null && price > 0 ? a / price * 100 : null;
    const prevAtr = candles.length >= 28 ? atr(candles.slice(0, -14), 14) : null;
    const volReg = natr === null ? null : natr > 5 ? 'HIGH' : natr < 1 ? 'LOW' : 'NORMAL';
    const expansion = a !== null && prevAtr !== null ? a > prevAtr : null;
    const highs = candles.slice(-20).map(x => x.high), lows = candles.slice(-20).map(x => x.low);
    const sh = highs.length ? Math.max(...highs) : null, sl = lows.length ? Math.min(...lows) : null;
    const prevHigh = candles.length > 20 ? Math.max(...candles.slice(-21, -1).map(x => x.high)) : null;
    const prevLow = candles.length > 20 ? Math.min(...candles.slice(-21, -1).map(x => x.low)) : null;
    const breakout = price > 0 && prevHigh !== null ? price > prevHigh : null, breakdown = price > 0 && prevLow !== null ? price < prevLow : null;
    const avgVol = volume.length >= 20 ? volume.slice(-20).reduce((x, y) => x + y, 0) / 20 : null;
    const rv = avgVol && avgVol > 0 ? (volume.at(-1) ?? 0) / avgVol : null;
    const volCh = volume.length >= 2 && volume.at(-2) !== 0 ? (volume.at(-1) - volume.at(-2)) / Math.abs(volume.at(-2)) * 100 : null;
    const slopeVal = slope(close, 20);
    const alignment = e9 !== null && e21 !== null && e50 !== null ? (e9 > e21 && e21 > e50 ? 1 : e9 < e21 && e21 < e50 ? -1 : 0) : null;
    const trendStrength = slopeVal !== null && price > 0 ? Math.min(100, Math.abs(slopeVal) / price * 20_000) : null;
    const hh = candles.length >= 4 ? candles.at(-1).high > candles.at(-3).high : null, hl = candles.length >= 4 ? candles.at(-1).low > candles.at(-3).low : null;
    const lh = candles.length >= 4 ? candles.at(-1).high < candles.at(-3).high : null, ll = candles.length >= 4 ? candles.at(-1).low < candles.at(-3).low : null;
    return {
        ema9: e9 === null ? missing() : derived(e9, nowMs), ema21: e21 === null ? missing() : derived(e21, nowMs), ema50: e50 === null ? missing() : derived(e50, nowMs), ema200: e200 === null ? missing() : derived(e200, nowMs),
        rsi14: r === null ? missing() : derived(r, nowMs), macd: macd === null ? missing() : derived(macd, nowMs), macdSignal: ms === null ? missing() : derived(ms, nowMs), macdHistogram: hist === null ? missing() : derived(hist, nowMs),
        atr14: a === null ? missing() : derived(a, nowMs), normalizedAtr: natr === null ? missing() : derived(natr, nowMs), volatilityRegime: volReg === null ? missing() : derived(volReg, nowMs), volatilityExpansion: expansion === null ? missing() : derived(expansion, nowMs),
        swingHigh: sh === null ? missing() : derived(sh, nowMs), swingLow: sl === null ? missing() : derived(sl, nowMs), higherHigh: hh === null ? missing() : derived(hh, nowMs), higherLow: hl === null ? missing() : derived(hl, nowMs), lowerHigh: lh === null ? missing() : derived(lh, nowMs), lowerLow: ll === null ? missing() : derived(ll, nowMs),
        breakout: breakout === null ? missing() : derived(breakout, nowMs), breakdown: breakdown === null ? missing() : derived(breakdown, nowMs), support: sl === null ? missing() : derived(sl, nowMs), resistance: sh === null ? missing() : derived(sh, nowMs),
        volume: (volume.at(-1) ?? null) === null ? missing() : derived(volume.at(-1), nowMs), volumeChange: volCh === null ? missing() : derived(volCh, nowMs), relativeVolume: rv === null ? missing() : derived(rv, nowMs),
        trendAlignment: alignment === null ? missing() : derived(alignment, nowMs), slope: slopeVal === null ? missing() : derived(slopeVal, nowMs), trendStrength: trendStrength === null ? missing() : derived(trendStrength, nowMs)
    };
}
export function taScore(ta) { const vals = [ta.trendAlignment.value, ta.rsi14.value === null ? null : (ta.rsi14.value - 50) / 50, ta.macdHistogram.value === null ? null : Math.sign(ta.macdHistogram.value), ta.breakout.value === null ? null : (ta.breakout.value ? 1 : ta.breakdown.value ? -1 : 0)]; if (vals.some(v => v === null))
    return null; const score = 50 + vals[0] * 20 + vals[1] * 15 + vals[2] * 10 + vals[3] * 15; return Math.max(0, Math.min(100, score)); }
