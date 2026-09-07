import { readFile } from 'node:fs/promises';
import { fitIsotonic, calibrationMetrics, serializeCalibrationModel } from './calibration.js';
import { computeTA, taScore } from './ta.js';
function csvLine(line) { const out = []; let cur = '', quoted = false; for (const ch of line) {
    if (ch === '"')
        quoted = !quoted;
    else if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
    }
    else
        cur += ch;
} out.push(cur); return out; }
export async function loadCsv(path) {
    const text = await readFile(path, 'utf8');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2)
        return [];
    const h = csvLine(lines[0] ?? '').map(x => x.trim().toLowerCase());
    const idx = (n) => h.indexOf(n);
    const ti = idx('timestamp'), oi = idx('open'), hi = idx('high'), li = idx('low'), ci = idx('close'), vi = idx('volume');
    if ([ti, oi, hi, li, ci].some(x => x < 0))
        throw new Error('BACKTEST_CSV_REQUIRES_TIMESTAMP_OPEN_HIGH_LOW_CLOSE');
    const rows = [];
    for (const line of lines.slice(1)) {
        const a = csvLine(line), ts = Number(a[ti]);
        const row = { timestampMs: ts < 1e12 ? ts * 1000 : ts, open: Number(a[oi]), high: Number(a[hi]), low: Number(a[li]), close: Number(a[ci]), volume: vi >= 0 ? Number(a[vi]) : 0 };
        if (Object.values(row).every(Number.isFinite) && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)
            rows.push(row);
    }
    return rows.sort((a, b) => a.timestampMs - b.timestampMs);
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mean = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const std = (v) => { if (v.length < 2)
    return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
function featureAt(candles, i) {
    const ta = computeTA(candles.slice(0, i), candles[i]?.timestampMs);
    const score = taScore(ta);
    if (score === null)
        return null;
    const bullish = (ta.trendAlignment.value === 1 ? 1 : 0) + (ta.rsi14.value !== null && ta.rsi14.value > 55 ? 1 : 0) + (ta.macdHistogram.value !== null && ta.macdHistogram.value > 0 ? 1 : 0) + (ta.breakout.value === true ? 1 : 0) >= 2;
    return { ta, raw: clamp(score / 100), bullish };
}
function discoverCandidates(candles, atrStopMultiple, rewardRisk, threshold) {
    const out = [];
    for (let i = 220; i < candles.length - 1; i++) {
        const f = featureAt(candles, i);
        const next = candles[i + 1];
        if (!f || !next || !f.bullish || f.raw < threshold)
            continue;
        const atr = f.ta.atr14.value;
        if (atr === null || !Number.isFinite(atr) || atr <= 0)
            continue;
        const entry = next.open;
        const stop = Math.max(0, entry - atr * atrStopMultiple);
        const target = entry + atr * atrStopMultiple * rewardRisk;
        out.push({ signalIndex: i, entryIndex: i + 1, entry, stop, target, raw: f.raw });
    }
    return out;
}
function outcomeForCandidate(candles, c, maxExitIndex = candles.length - 1) {
    const end = Math.min(maxExitIndex, candles.length - 1);
    for (let j = c.entryIndex; j <= end; j++) {
        const bar = candles[j];
        const stopHit = bar.low <= c.stop;
        const targetHit = bar.high >= c.target;
        // When both levels are touched by the same OHLC bar, assume the adverse level was hit first.
        if (stopHit)
            return { win: false, exitIndex: j, exitPrice: c.stop, reason: 'STOP_LOSS' };
        if (targetHit)
            return { win: true, exitIndex: j, exitPrice: c.target, reason: 'TAKE_PROFIT' };
    }
    const last = candles[end];
    return { win: last.close > c.entry, exitIndex: end, exitPrice: last.close, reason: 'END_OF_DATA' };
}
export function runSimpleBacktest(candles, initialCapital, feeBps, slippageBps, options = {}) {
    const riskPerTradePct = options.riskPerTradePct ?? 1;
    const maxPositionUsd = options.maxPositionUsd ?? 100;
    const maxTotalExposureUsd = options.maxTotalExposureUsd ?? 200;
    const atrStopMultiple = options.atrStopMultiple ?? 2;
    const rewardRisk = options.rewardRisk ?? 1.8;
    const threshold = options.entryScoreThreshold ?? 0.55;
    const base = { periodStartMs: candles[0]?.timestampMs ?? null, periodEndMs: candles.at(-1)?.timestampMs ?? null, metricPeriod: 'PER_TRADE_NOT_ANNUALIZED', riskPerTradePct, maxPositionUsd, maxTotalExposureUsd };
    if (candles.length < 250)
        return { ...base, methodology: 'canonical-v9-strategy', lookaheadBiasMitigated: true, trades: 0, wins: 0, losses: 0, winRatePct: 0, lossRatePct: 0, averageWin: 0, averageLoss: 0, riskRewardActual: null, grossPnl: 0, fees: 0, slippageCost: 0, netPnl: 0, totalReturnPct: 0, maxDrawdown: 0, maxDrawdownPct: 0, expectancyPerTrade: 0, profitFactor: null, sharpeRatio: null, sortinoRatio: null, calmarRatio: null, sampleSufficient: false, brierScore: null, ece: null, calibrationStatus: 'INSUFFICIENT_DATA', sampleSize: 0, seedCalibration: null, limitations: ['At least 250 candles are required for the canonical feature set.', 'This historical candle backtest cannot provide external FA/news/social or historical Jupiter execution evidence unless the input dataset contains it.'], tradesDetail: [] };
    const candidates = discoverCandidates(candles, atrStopMultiple, rewardRisk, threshold);
    const split = Math.floor(candidates.length * 0.7);
    const cutoffIndex = split > 0 ? candidates[split]?.entryIndex ?? candles.length - 1 : candles.length - 1;
    const trainCandidates = candidates.slice(0, split);
    // Training outcomes are truncated at the chronological train/test boundary.
    // This prevents the last training trades from observing candles belonging to the test period.
    const trainResolved = trainCandidates
        .map(c => ({ candidate: c, outcome: outcomeForCandidate(candles, c, Math.max(c.entryIndex, cutoffIndex - 1)) }))
        .filter(x => x.outcome.exitIndex < cutoffIndex);
    const train = trainResolved.map(x => x.outcome);
    const trainOut = train.map(x => x.win);
    const model = fitIsotonic(trainResolved.map(x => x.candidate.raw), trainOut);
    const seedSerialized = model ? serializeCalibrationModel(model) : null;
    const test = candidates.slice(split);
    const testOut = test.map(c => outcomeForCandidate(candles, c));
    const cm = model ? calibrationMetrics(test.map(c => model.predict(c.raw)), testOut.map(x => x.win)) : { brier: null, ece: null };
    let cash = initialCapital, peak = initialCapital, maxDd = 0, totalFees = 0, totalSlip = 0;
    const trades = [];
    let nextAllowedIndex = 0;
    for (const c of test) {
        if (c.entryIndex < nextAllowedIndex)
            continue;
        const calibrated = model?.predict(c.raw) ?? null;
        if (calibrated === null || calibrated < 0.55)
            continue;
        const outcome = outcomeForCandidate(candles, c);
        const entry = c.entry * (1 + slippageBps / 10000);
        const exit = outcome.exitPrice * (1 - slippageBps / 10000);
        const equity = Math.max(0, cash);
        const riskBudget = equity * riskPerTradePct / 100;
        const riskPerUnit = Math.max(1e-12, entry - c.stop);
        const maxNotional = Math.min(maxPositionUsd, maxTotalExposureUsd, equity);
        const qty = Math.min(riskBudget / riskPerUnit, maxNotional / entry);
        if (!Number.isFinite(qty) || qty <= 0)
            continue;
        const notional = qty * entry;
        const entryFee = notional * feeBps / 10000;
        const exitNotional = qty * exit;
        const exitFee = exitNotional * feeBps / 10000;
        const gross = (exit - entry) * qty;
        const slip = Math.abs(entry - c.entry) * qty + Math.abs(outcome.exitPrice - exit) * qty;
        const net = gross - entryFee - exitFee;
        cash += net;
        totalFees += entryFee + exitFee;
        totalSlip += slip;
        trades.push({ entryTimestampMs: candles[c.entryIndex].timestampMs, exitTimestampMs: candles[outcome.exitIndex].timestampMs, entryPrice: entry, exitPrice: exit, grossPnl: gross, fees: entryFee + exitFee, slippageCost: slip, netPnl: net, returnPct: notional ? net / notional * 100 : 0, signal: 'BUY', exitReason: outcome.reason, riskBudgetUsd: riskBudget, positionNotionalUsd: notional });
        nextAllowedIndex = outcome.exitIndex + 1;
        peak = Math.max(peak, cash);
        maxDd = Math.max(maxDd, peak - cash);
    }
    const wins = trades.filter(t => t.netPnl > 0), losses = trades.filter(t => t.netPnl < 0);
    const net = trades.reduce((s, t) => s + t.netPnl, 0), gross = trades.reduce((s, t) => s + t.grossPnl, 0);
    const avgWin = wins.length ? mean(wins.map(t => t.netPnl)) : 0, avgLoss = losses.length ? Math.abs(mean(losses.map(t => t.netPnl))) : 0;
    const rets = trades.map(t => t.returnPct / 100), sd = std(rets), down = std(rets.map(x => Math.min(0, x)));
    const seedCalibration = model && seedSerialized ? { source: 'BACKTEST_SEED', strategyVersion: 'budsky-v9.0.0', featureVersion: 'ta-fa-v1.1', methodology: 'ATR_TRADE_OUTCOME', trainedThroughTimestampMs: candles[Math.max(0, cutoffIndex - 1)]?.timestampMs ?? candles[Math.max(0, Math.floor(candles.length * 0.7))].timestampMs, trainingSamples: trainResolved.length, model: seedSerialized } : null;
    return { ...base, methodology: 'canonical-v9-strategy', lookaheadBiasMitigated: true, trades: trades.length, wins: wins.length, losses: losses.length, winRatePct: trades.length ? wins.length / trades.length * 100 : 0, lossRatePct: trades.length ? losses.length / trades.length * 100 : 0, averageWin: avgWin, averageLoss: avgLoss, riskRewardActual: avgLoss ? avgWin / avgLoss : null, grossPnl: gross, fees: totalFees, slippageCost: totalSlip, netPnl: net, totalReturnPct: initialCapital ? net / initialCapital * 100 : 0, maxDrawdown: maxDd, maxDrawdownPct: peak ? maxDd / peak * 100 : 0, expectancyPerTrade: trades.length ? net / trades.length : 0, profitFactor: losses.length ? wins.reduce((s, t) => s + t.netPnl, 0) / Math.abs(losses.reduce((s, t) => s + t.netPnl, 0)) : null, sharpeRatio: sd ? mean(rets) / sd : null, sortinoRatio: down ? mean(rets) / down : null, calmarRatio: maxDd > 0 ? (net / initialCapital) / (maxDd / peak) : null, sampleSufficient: split >= 100, brierScore: cm.brier, ece: cm.ece, calibrationStatus: model && split >= 100 ? 'CALIBRATED' : 'INSUFFICIENT_DATA', sampleSize: split, seedCalibration, limitations: ['Backtest metrics are per-trade, not annualized.', 'The seed model is trained only on the first 70% of candidate trades and evaluated on later candidates.', 'Entry candidates use observed historical candles; same-bar stop+target ambiguity is conservatively resolved as stop-loss first.', 'Historical on-chain fundamentals, news/social and Jupiter fill/latency evidence are not inferred from OHLCV.'], tradesDetail: trades };
}
