import { PublicKey } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { walletSessionAuthorized } from '../../src/api/auth.js';
export default async function (req) {
    if (req.method !== 'GET')
        return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    let c;
    try {
        c = loadConfig();
    }
    catch (e) {
        return Response.json({ error: 'config_invalid', detail: e instanceof Error ? e.message : 'unknown' }, { status: 503 });
    }
    const walletParam = new URL(req.url).searchParams.get('wallet');
    if (!walletParam)
        return Response.json({ error: 'wallet_required' }, { status: 400 });
    let wallet;
    try {
        wallet = new PublicKey(walletParam).toBase58();
    }
    catch {
        return Response.json({ error: 'invalid_wallet' }, { status: 400 });
    }
    if (!walletSessionAuthorized(req, c, wallet))
        return Response.json({ error: 'wallet_auth_required' }, { status: 401 });
    try {
        const store = new SupabaseEventStore(c);
        const trades = await store.getRiskTrades(wallet);
        const groups = new Map();
        for (const t of trades.filter(x => x.state === 'CONFIRMED' || x.state === 'RECONCILED')) {
            const id = t.positionId || t.tradeId;
            const g = groups.get(id) || { positionId: id, wallet, side: t.tradeSide || 'ENTRY', state: 'OPEN', entryTradeId: null, exitTradeId: null, mint: t.intent.outputMint, quantityRaw: '0', notionalUsd: 0, realizedPnlUsd: null, openedAtMs: t.createdAtMs, updatedAtMs: t.createdAtMs, signature: null };
            g.updatedAtMs = Math.max(g.updatedAtMs, t.createdAtMs);
            if (t.tradeSide === 'ENTRY') {
                g.entryTradeId = t.tradeId;
                g.mint = t.intent.outputMint;
                g.quantityRaw = (t.positionQuantityRaw ?? t.intent.expectedOutputRaw).toString();
                g.notionalUsd = t.notionalUsd ?? Number(t.intent.inputAmountRaw) / 1e6;
                g.signature = t.signature ?? g.signature;
            }
            if (t.tradeSide === 'EXIT') {
                g.exitTradeId = t.tradeId;
                g.state = 'CLOSED';
                g.realizedPnlUsd = t.realizedPnlUsd ?? null;
                g.signature = t.signature ?? g.signature;
            }
            groups.set(id, g);
        }
        const positions = [...groups.values()].filter(p => p.state === 'OPEN');
        return Response.json({ ok: true, wallet, positions, updatedAtMs: Date.now() }, { headers: { 'cache-control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'POSITIONS_FAILED' }, { status: 503 });
    }
}
