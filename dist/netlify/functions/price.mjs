const BASE = 'https://api.jup.ag';
const cache = new Map();
const TTL = 3_000;
const MAX_IDS = 10;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
async function fetchPrices(ids) {
    const key = process.env.JUPITER_API_KEY || '';
    if (!key)
        throw new Error('JUPITER_API_KEY is required for live price polling');
    const cacheKey = ids.slice().sort().join(',');
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.at < TTL)
        return cached.data;
    const r = await fetch(`${BASE}/price/v3?ids=${encodeURIComponent(ids.join(','))}`, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(7000),
    });
    if (!r.ok)
        throw new Error(`JUPITER_PRICE_${r.status}`);
    const raw = (await r.json());
    const data = {
        updatedAtMs: now,
        prices: ids.reduce((acc, id) => {
            const row = raw[id];
            acc[id] = {
                usdPrice: typeof row?.usdPrice === 'number' && Number.isFinite(row.usdPrice) ? row.usdPrice : null,
                priceChange24h: typeof row?.priceChange24h === 'number' && Number.isFinite(row.priceChange24h) ? row.priceChange24h : null,
            };
            return acc;
        }, {}),
    };
    cache.set(cacheKey, { at: now, data });
    return data;
}
export default async (req) => {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { 'content-type': 'application/json' } });
    }
    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids') || '';
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
    if (ids.length === 0) {
        return new Response(JSON.stringify({ error: 'IDS_REQUIRED' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    if (!ids.every((id) => MINT_RE.test(id))) {
        return new Response(JSON.stringify({ error: 'INVALID_MINT_FORMAT' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    try {
        const data = await fetchPrices(ids);
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'PRICE_FETCH_FAILED' }), {
            status: 503,
            headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
    }
};
