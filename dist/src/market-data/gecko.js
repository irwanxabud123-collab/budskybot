const BASE = 'https://api.geckoterminal.com/api/v2', ACCEPT = 'application/json;version=20230203', TTL = 120_000, STALE_CACHE_MAX = 300_000;
const cache = new Map();
async function getJson(url, maxAge = TTL) { const hit = cache.get(url); if (hit && Date.now() - hit.at < maxAge)
    return hit.value; try {
    const r = await fetch(url, { headers: { accept: ACCEPT }, signal: AbortSignal.timeout(7000) });
    if (!r.ok)
        throw new Error(`GECKO_${r.status}`);
    const v = await r.json();
    cache.set(url, { at: Date.now(), value: v });
    return v;
}
catch (e) {
    if (hit && Date.now() - hit.at < STALE_CACHE_MAX)
        return hit.value;
    throw e;
} }
function tfParams(tf) { switch (tf) {
    case '5m': return 'minute?aggregate=5';
    case '15m': return 'minute?aggregate=15';
    case '1h': return 'hour?aggregate=1';
    case '4h': return 'hour?aggregate=4';
    default: throw new Error(`UNSUPPORTED_TIMEFRAME:${tf}`);
} }
export async function findTopPool(mint) {
    try {
        const token = await getJson(`${BASE}/networks/solana/tokens/${mint}`);
        const rel = token.data?.relationships?.top_pools?.data?.[0]?.id;
        const attr = token.data?.attributes?.top_pools?.[0];
        const pool = (rel ?? attr)?.split('_').pop();
        if (pool)
            return pool;
    }
    catch { }
    const x = await getJson(`${BASE}/networks/solana/tokens/${mint}/pools`);
    const pools = (x.data ?? []).slice().sort((a, b) => Number(b.attributes?.reserve_in_usd ?? 0) - Number(a.attributes?.reserve_in_usd ?? 0));
    const pool = pools[0]?.attributes?.address ?? pools[0]?.id?.split('_').pop();
    if (!pool)
        throw new Error('GECKO_POOL_NOT_FOUND');
    return pool;
}
export async function fetchOHLCV(pool, timeframe, limit = 250) { const x = await getJson(`${BASE}/networks/solana/pools/${pool}/ohlcv/${tfParams(timeframe)}&limit=${Math.min(limit, 1000)}&currency=usd`); const rows = x.data?.attributes?.ohlcv_list ?? []; const out = rows.map(r => ({ timestampMs: Number(r[0]) * 1000, open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) })).filter(c => [c.timestampMs, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0).sort((a, b) => a.timestampMs - b.timestampMs); if (out.length < 50)
    throw new Error(`GECKO_OHLCV_INSUFFICIENT:${timeframe}:${out.length}`); return out; }
export async function fetchMultiTimeframe(mint) { const pool = await findTopPool(mint); const out = {}; for (const tf of ['4h', '1h', '15m', '5m'])
    out[tf] = await fetchOHLCV(pool, tf, 250); return out; }
export async function fetchTokenMarket(mint) { const pool = await findTopPool(mint); const x = await getJson(`${BASE}/networks/solana/tokens/${mint}`); const a = x.data?.attributes; return { priceUsd: a?.price_usd ? Number(a.price_usd) : null, fdvUsd: a?.fdv_usd ? Number(a.fdv_usd) : null, marketCapUsd: a?.market_cap_usd ? Number(a.market_cap_usd) : null, liquidityUsd: a?.total_reserve_in_usd ? Number(a.total_reserve_in_usd) : null, pool }; }
export function marketFromQuote(inputMint, outputMint, inputAmountRaw, expectedOutputRaw, timestampMs, source, priceImpactPct, liquidityUsd, inputDecimals, outputDecimals, entryPriceUsd) { const base = { inputMint, outputMint, inputAmountRaw, expectedOutputRaw, timestampMs, source, freshnessMs: 0, valid: expectedOutputRaw > 0n, priceImpactPct, estimatedLiquidityUsd: liquidityUsd }; return entryPriceUsd === null ? base : { ...base, entryPriceUsd }; }
