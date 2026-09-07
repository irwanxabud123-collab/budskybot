import { findTopPool, fetchOHLCV } from '../../src/market-data/gecko.js';
import { computeTA, taScore } from '../../src/engine/ta.js';
import { loadBacktestSeed } from '../../src/engine/calibration-store.js';
import { loadConfig } from '../../src/config/config.js';
export default async function (req) {
    if (req.method !== 'GET')
        return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const mint = new URL(req.url).searchParams.get('mint');
    if (!mint)
        return Response.json({ error: 'mint_required' }, { status: 400 });
    try {
        const c = loadConfig();
        const pool = await findTopPool(mint);
        const candles = await fetchOHLCV(pool, '15m', 250);
        const ta = computeTA(candles);
        const score = taScore(ta);
        const seed = await loadBacktestSeed(c.BACKTEST_SEED_PATH);
        const probability = score !== null && seed.status === 'CALIBRATED' && seed.model ? seed.model.predict(Math.max(0, Math.min(1, score / 100))) : null;
        const details = {
            ema9: ta.ema9.value, ema21: ta.ema21.value, ema50: ta.ema50.value, ema200: ta.ema200.value,
            rsi14: ta.rsi14.value, macd: ta.macd.value, macdSignal: ta.macdSignal.value, macdHistogram: ta.macdHistogram.value,
            atr14: ta.atr14.value, normalizedAtr: ta.normalizedAtr.value, volatilityRegime: ta.volatilityRegime.value,
            breakout: ta.breakout.value, breakdown: ta.breakdown.value, support: ta.support.value, resistance: ta.resistance.value,
            relativeVolume: ta.relativeVolume.value, volumeChange: ta.volumeChange.value,
            trendAlignment: ta.trendAlignment.value, slope: ta.slope.value, trendStrength: ta.trendStrength.value,
            source: 'GeckoTerminal 15m OHLCV', candleCount: candles.length, lastCandleAtMs: candles.at(-1)?.timestampMs ?? null,
            probability, probabilityStatus: probability === null ? 'NOT_CALIBRATED' : 'CALIBRATED', probabilitySource: probability === null ? 'NONE' : 'BACKTEST_SEED'
        };
        return Response.json({ ok: true, mint, pool, score, provenance: score === null ? 'INSUFFICIENT_OHLCV' : 'OHLCV_DERIVED', probability, probabilityStatus: probability === null ? 'NOT_CALIBRATED' : 'CALIBRATED', probabilitySource: probability === null ? 'NONE' : 'BACKTEST_SEED', details, candles: candles.slice(-120), updatedAtMs: Date.now() }, { headers: { 'cache-control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ ok: false, mint, score: null, provenance: 'UNAVAILABLE', error: e instanceof Error ? e.message : 'TECHNICAL_UNAVAILABLE', updatedAtMs: Date.now() }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
}
