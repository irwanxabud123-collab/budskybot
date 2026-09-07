const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function fitIsotonic(raw, outcomes) {
    if (raw.length !== outcomes.length || raw.length < 30)
        return null;
    const pairs = raw.map((p, i) => ({ p: clamp(p), y: (outcomes[i] ?? false) ? 1 : 0 })).sort((a, b) => a.p - b.p);
    const blocks = pairs.map(x => ({ sum: x.y, n: 1, min: x.p, max: x.p }));
    for (let i = 0; i < blocks.length - 1;) {
        if (blocks[i].sum / blocks[i].n <= blocks[i + 1].sum / blocks[i + 1].n) {
            i++;
            continue;
        }
        const a = blocks[i], b = blocks[i + 1];
        blocks.splice(i, 2, { sum: a.sum + b.sum, n: a.n + b.n, min: a.min, max: b.max });
        if (i > 0)
            i--;
    }
    const points = blocks.map(b => ({ min: b.min, max: b.max, value: b.sum / b.n }));
    return {
        method: 'isotonic', version: 'isotonic-v1', n: raw.length, points,
        predict(p) { const x = clamp(p); let best = points[0]; for (const point of points) {
            if (x >= point.min)
                best = point;
            else
                break;
        } return best?.value ?? 0.5; }
    };
}
export function fitPlatt(raw, outcomes) {
    if (raw.length !== outcomes.length || raw.length < 30)
        return null;
    let a = 1, b = 0;
    for (let iter = 0; iter < 500; iter++) {
        let ga = 0, gb = 0;
        for (let i = 0; i < raw.length; i++) {
            const p = clamp(raw[i], 1e-6, 1 - 1e-6);
            const x = Math.max(-6, Math.min(6, Math.log(p / (1 - p))));
            const z = Math.max(-30, Math.min(30, a * x + b));
            const pred = 1 / (1 + Math.exp(-z));
            const y = (outcomes[i] ?? false) ? 1 : 0;
            ga += (pred - y) * x;
            gb += pred - y;
        }
        a -= 0.01 * ga / raw.length;
        b -= 0.01 * gb / raw.length;
    }
    return { method: 'platt', version: 'platt-v1', n: raw.length, predict(p) { const x = Math.log(clamp(p, 1e-6, 1 - 1e-6) / (1 - clamp(p, 1e-6, 1 - 1e-6))); const z = Math.max(-30, Math.min(30, a * x + b)); return 1 / (1 + Math.exp(-z)); } };
}
export function serializeCalibrationModel(model) {
    if (!model.points?.length)
        return null;
    return { method: model.method, version: model.version, n: model.n, points: model.points };
}
export function deserializeCalibrationModel(serialized) {
    if (!serialized || serialized.method !== 'isotonic' || !Array.isArray(serialized.points) || serialized.points.length === 0 || serialized.n < 30)
        return null;
    const points = serialized.points.filter(p => Number.isFinite(p.min) && Number.isFinite(p.max) && Number.isFinite(p.value)).map(p => ({ min: clamp(p.min), max: clamp(p.max), value: clamp(p.value) })).sort((a, b) => a.min - b.min);
    if (!points.length)
        return null;
    return { method: 'isotonic', version: serialized.version, n: serialized.n, points, predict(raw) { const x = clamp(raw); let best = points[0]; for (const point of points) {
            if (x >= point.min)
                best = point;
            else
                break;
        } return best?.value ?? 0.5; } };
}
export function calibrationMetrics(pred, outcomes, binCount = 10) {
    if (pred.length !== outcomes.length || pred.length === 0)
        return { brier: null, ece: null, bins: [] };
    const bins = Array.from({ length: binCount }, (_, i) => ({ lower: i / binCount, upper: (i + 1) / binCount, n: 0, predicted: 0, observed: 0 }));
    let brier = 0;
    for (let i = 0; i < pred.length; i++) {
        const p = clamp(pred[i]);
        const y = (outcomes[i] ?? false) ? 1 : 0;
        brier += (p - y) ** 2;
        const idx = Math.min(binCount - 1, Math.floor(p * binCount));
        const bin = bins[idx];
        bin.n++;
        bin.predicted += p;
        bin.observed += y;
    }
    let ece = 0;
    for (const bin of bins) {
        if (bin.n) {
            bin.predicted /= bin.n;
            bin.observed /= bin.n;
            ece += (bin.n / pred.length) * Math.abs(bin.predicted - bin.observed);
        }
    }
    return { brier: brier / pred.length, ece, bins };
}
