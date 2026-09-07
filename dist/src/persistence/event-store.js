import { randomUUID } from 'node:crypto';
export class SupabaseEventStore {
    c;
    base;
    key;
    constructor(c) {
        this.c = c;
        this.base = `${c.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
        this.key = c.SUPABASE_KEY || c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY;
        if (!c.SUPABASE_URL || !this.key)
            throw new Error('SUPABASE_PERSISTENCE_NOT_CONFIGURED');
    }
    async request(path, init = {}) {
        const r = await fetch(`${this.base}/${path}`, { ...init, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'content-type': 'application/json', ...(init.headers || {}) } });
        const text = await r.text();
        if (!r.ok)
            throw new Error(`SUPABASE_HTTP_${r.status}:${text.slice(0, 300)}`);
        return text ? JSON.parse(text) : {};
    }
    async append(type, data) {
        await this.request('bot_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: randomUUID(), event_type: type, timestamp_ms: Date.now(), data }) });
    }
    async appendReplayEvent(event) {
        const e = event;
        if (!e.event_id)
            throw new Error('REPLAY_EVENT_ID_REQUIRED');
        await this.request('replay_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ event_id: e.event_id, timestamp_ms: e.timestamp_ms ?? Date.now(), event }) });
    }
    async createOrGetTrade(trade) {
        const rows = await this.request('trades?select=*&idempotency_key=eq.' + encodeURIComponent(trade.idempotencyKey ?? trade.tradeId));
        if (rows[0])
            return this.fromRow(rows[0]);
        const row = this.toRow(trade);
        try {
            const created = await this.request('trades', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
            return this.fromRow(created[0]);
        }
        catch (e) {
            if (e instanceof Error && e.message.startsWith('SUPABASE_HTTP_409')) {
                const winner = await this.getTradeByIdempotency(trade.idempotencyKey ?? trade.tradeId);
                if (winner)
                    return winner;
            }
            throw e;
        }
    }
    async updateTrade(tradeId, patch) {
        const body = {};
        if (patch.state)
            body.state = patch.state;
        if (patch.signature)
            body.signature = patch.signature;
        if (Object.prototype.hasOwnProperty.call(patch, 'error'))
            body.error = patch.error ?? null;
        if (patch.requestId)
            body.request_id = patch.requestId;
        if (patch.quote)
            body.quote = this.jsonSafe(patch.quote);
        if (patch.transaction)
            body.transaction = patch.transaction;
        if (Object.prototype.hasOwnProperty.call(patch, 'realizedPnlUsd'))
            body.realized_pnl_usd = patch.realizedPnlUsd ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'feeUsd'))
            body.fee_usd = patch.feeUsd ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'notionalUsd'))
            body.notional_usd = patch.notionalUsd ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'executionSlippageBps'))
            body.execution_slippage_bps = patch.executionSlippageBps ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'positionId'))
            body.position_id = patch.positionId ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'tradeSide'))
            body.trade_side = patch.tradeSide ?? null;
        if (Object.prototype.hasOwnProperty.call(patch, 'positionQuantityRaw'))
            body.position_quantity_raw = patch.positionQuantityRaw?.toString() ?? null;
        body.updated_at = new Date().toISOString();
        await this.request(`trades?trade_id=eq.${encodeURIComponent(tradeId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    }
    async getRiskTrades(walletPublicKey) {
        const rows = await this.request('trades?select=*&wallet_public_key=eq.' + encodeURIComponent(walletPublicKey) + '&order=created_at.desc&limit=1000');
        return rows.map(r => this.fromRow(r));
    }
    async getConfirmedTradeCount(walletPublicKey) {
        const rows = await this.request('trades?select=trade_id&wallet_public_key=eq.' + encodeURIComponent(walletPublicKey) + '&state=in.(CONFIRMED,RECONCILED)&limit=1000');
        return rows.length;
    }
    async getTradeByIdempotency(key) { const rows = await this.request('trades?select=*&idempotency_key=eq.' + encodeURIComponent(key)); return rows[0] ? this.fromRow(rows[0]) : null; }
    async claimLease(lockKey, tradeId, ttlMs) {
        const rows = await this.request('rpc/claim_execution_lease', { method: 'POST', body: JSON.stringify({ p_lock_key: lockKey, p_trade_id: tradeId, p_ttl_ms: ttlMs }) });
        return Array.isArray(rows) ? Boolean(rows[0]?.claimed) : Boolean(rows?.claimed);
    }
    async releaseLease(lockKey) { await this.request('rpc/release_execution_lease', { method: 'POST', body: JSON.stringify({ p_lock_key: lockKey }) }); }
    async getTradeById(tradeId) { const rows = await this.request('trades?select=*&trade_id=eq.' + encodeURIComponent(tradeId)); return rows[0] ? this.fromRow(rows[0]) : null; }
    async getTradesByState(state) { const rows = await this.request('trades?select=*&state=eq.' + encodeURIComponent(state) + '&order=created_at.asc&limit=1000'); return rows.map(r => this.fromRow(r)); }
    async getReplayEvents() { return this.request('replay_events?select=*&order=timestamp_ms.asc&limit=10000'); }
    toRow(t) { return { wallet_public_key: t.walletPublicKey, trade_id: t.tradeId, signal_id: t.signalId, execution_id: t.executionId, idempotency_key: t.idempotencyKey, state: t.state, created_at: new Date(t.createdAtMs).toISOString(), signature: t.signature ?? null, error: t.error ?? null, request_id: t.requestId ?? null, transaction: t.transaction ?? null, realized_pnl_usd: t.realizedPnlUsd ?? null, fee_usd: t.feeUsd ?? null, notional_usd: t.notionalUsd ?? null, execution_slippage_bps: t.executionSlippageBps ?? null, position_id: t.positionId ?? t.tradeId, trade_side: t.tradeSide ?? 'ENTRY', position_quantity_raw: t.positionQuantityRaw?.toString() ?? null, intent: this.jsonSafe(t.intent), quote: t.quote ? this.jsonSafe(t.quote) : null }; }
    fromRow(r) {
        const base = { walletPublicKey: r.wallet_public_key ?? r.intent?.walletPublicKey ?? '', tradeId: r.trade_id, signalId: r.signal_id, executionId: r.execution_id, state: r.state, createdAtMs: Date.parse(r.created_at), idempotencyKey: r.idempotency_key, positionId: r.position_id ?? r.trade_id, tradeSide: r.trade_side === 'EXIT' ? 'EXIT' : 'ENTRY', intent: { ...r.intent, inputAmountRaw: BigInt(r.intent.inputAmountRaw), expectedOutputRaw: BigInt(r.intent.expectedOutputRaw) } };
        return { ...base, ...(r.signature ? { signature: r.signature } : {}), ...(r.error ? { error: r.error } : {}), ...(r.request_id ? { requestId: r.request_id } : {}), ...(r.transaction ? { transaction: r.transaction } : {}), ...(r.realized_pnl_usd !== null && r.realized_pnl_usd !== undefined ? { realizedPnlUsd: Number(r.realized_pnl_usd) } : {}), ...(r.fee_usd !== null && r.fee_usd !== undefined ? { feeUsd: Number(r.fee_usd) } : {}), ...(r.notional_usd !== null && r.notional_usd !== undefined ? { notionalUsd: Number(r.notional_usd) } : {}), ...(r.execution_slippage_bps !== null && r.execution_slippage_bps !== undefined ? { executionSlippageBps: Number(r.execution_slippage_bps) } : {}), ...(r.position_quantity_raw !== null && r.position_quantity_raw !== undefined ? { positionQuantityRaw: BigInt(r.position_quantity_raw) } : {}), ...(r.quote ? { quote: this.restoreQuote(r.quote) } : {}) };
    }
    jsonSafe(v) { if (typeof v === 'bigint')
        return v.toString(); if (Array.isArray(v))
        return v.map(x => this.jsonSafe(x)); if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.jsonSafe(x)])); return v; }
    restoreQuote(q) { return { ...q, inAmount: BigInt(q.inAmount), outAmount: BigInt(q.outAmount), minOutputAmount: BigInt(q.minOutputAmount) }; }
}
