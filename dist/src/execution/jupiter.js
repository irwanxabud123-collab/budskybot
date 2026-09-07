import { fetchJson } from '../infra/http.js';
export class JupiterClient {
    c;
    constructor(c) {
        this.c = c;
    }
    headers() { return this.c.JUPITER_API_KEY ? { 'x-api-key': this.c.JUPITER_API_KEY } : {}; }
    async order(inputMint, outputMint, amount, taker, slippageBps) {
        const u = new URL(`${this.c.JUPITER_BASE_URL}/order`);
        u.searchParams.set('inputMint', inputMint);
        u.searchParams.set('outputMint', outputMint);
        u.searchParams.set('amount', amount.toString());
        if (taker)
            u.searchParams.set('taker', taker);
        u.searchParams.set('slippageBps', String(slippageBps));
        const raw = await fetchJson(u.toString(), { headers: this.headers() }, 8000, 2);
        if (raw.inputMint !== inputMint || raw.outputMint !== outputMint || raw.inAmount !== amount.toString())
            throw new Error('JUPITER_QUOTE_MISMATCH');
        const out = BigInt(raw.outAmount), min = BigInt(raw.otherAmountThreshold ?? raw.outAmount);
        const impact = Number(raw.priceImpactPct ?? raw.priceImpact ?? NaN);
        if (!Number.isFinite(impact) || out <= 0n || min <= 0n || min > out)
            throw new Error('JUPITER_QUOTE_INVALID');
        const quote = { ...(raw.requestId ? { requestId: raw.requestId } : {}), inputMint, outputMint, inAmount: BigInt(raw.inAmount), outAmount: out, minOutputAmount: min, slippageBps: raw.slippageBps ?? slippageBps, priceImpactPct: impact, timestampMs: Date.now(), raw };
        return { quote, transaction: raw.transaction ?? null, requestId: raw.requestId ?? null, raw };
    }
    async execute(signedTransactionBase64, requestId) { return fetchJson(`${this.c.JUPITER_BASE_URL}/execute`, { method: 'POST', headers: { ...this.headers(), 'content-type': 'application/json' }, body: JSON.stringify({ signedTransaction: signedTransactionBase64, requestId }) }, 15000, 0); }
}
