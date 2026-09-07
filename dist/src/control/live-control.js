import { randomUUID } from 'node:crypto';
export class LiveControlStore {
    url;
    key;
    constructor(c) { this.url = `${c.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`; this.key = c.SUPABASE_SERVICE_ROLE_KEY || c.SUPABASE_SECRET_KEY || c.SUPABASE_KEY; if (!c.SUPABASE_URL || !this.key)
        throw new Error('SUPABASE_PERSISTENCE_NOT_CONFIGURED'); }
    async request(path, init = {}) { const r = await fetch(`${this.url}/${path}`, { ...init, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'content-type': 'application/json', ...(init.headers || {}) }, signal: init.signal || AbortSignal.timeout(5000) }); const text = await r.text(); if (!r.ok)
        throw new Error(`SUPABASE_HTTP_${r.status}:${text.slice(0, 300)}`); return text ? JSON.parse(text) : {}; }
    async get() { const rows = await this.request('bot_control_state?select=mode,live_enabled,emergency_stop,updated_at,updated_by,version&id=eq.singleton'); const r = rows[0]; if (!r)
        throw new Error('BOT_CONTROL_STATE_NOT_INITIALIZED'); return { mode: r.mode === 'LIVE' ? 'LIVE' : 'PAPER', liveEnabled: Boolean(r.live_enabled), emergencyStop: Boolean(r.emergency_stop), updatedAtMs: Date.parse(r.updated_at), updatedBy: r.updated_by ?? null, version: Number(r.version) || 0 }; }
    async mutate(action, actor) { const current = await this.get(); let patch; if (action === 'ACTIVATE_LIVE') {
        if (current.emergencyStop)
            throw new Error('EMERGENCY_STOP_ACTIVE_CLEAR_IT_FIRST');
        patch = { mode: 'LIVE', live_enabled: true };
    }
    else if (action === 'DEACTIVATE_LIVE') {
        patch = { mode: 'PAPER', live_enabled: false };
    }
    else if (action === 'EMERGENCY_STOP') {
        patch = { mode: 'PAPER', live_enabled: false, emergency_stop: true };
    }
    else if (action === 'CLEAR_EMERGENCY_STOP') {
        patch = { emergency_stop: false };
    }
    else
        patch = { mode: 'PAPER', live_enabled: false }; patch.updated_at = new Date().toISOString(); patch.updated_by = actor; patch.version = current.version + 1; await this.request('bot_control_state?id=eq.singleton', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); await this.request('bot_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: randomUUID(), event_type: `control_${action.toLowerCase()}`, timestamp_ms: Date.now(), data: { actor, previous: current, next: patch } }) }); return this.get(); }
}
