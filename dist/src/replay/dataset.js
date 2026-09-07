const n = (x) => x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
const s = (x) => x === null || x === undefined ? null : String(x);
const b = (x) => x === null || x === undefined ? null : Boolean(x);
const a = (x) => Array.isArray(x) ? x : null;
const p = (x) => x === 'OBSERVED' || x === 'DERIVED' || x === 'MISSING' ? x : 'MISSING';
const obj = (x) => x && typeof x === 'object' ? x : {};
export function normalizeEvent(value) {
    if (!value || typeof value !== 'object')
        throw new Error('REPLAY_EVENT_INVALID');
    const v = value;
    const m = obj(v.market_snapshot), q = obj(v.jupiter_quote), l = obj(v.liquidity), t = obj(v.token_data), r = obj(v.risk_engine), e = obj(v.execution), pn = obj(v.pnl), st = v.strategy && typeof v.strategy === 'object' ? obj(v.strategy) : null, raw = obj(v.raw);
    const ts = Number(v.timestamp_ms);
    if (!Number.isFinite(ts) || ts <= 0)
        throw new Error('REPLAY_TIMESTAMP_INVALID');
    if (typeof v.pair !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(v.pair))
        throw new Error('REPLAY_PAIR_INVALID');
    return {
        execution_mode: v.execution_mode === 'PAPER_SIMULATED' || v.execution_mode === 'ON_CHAIN' ? v.execution_mode : undefined,
        schema_version: '2.0.0', event_id: s(v.event_id) || `${ts}-${s(v.trade_id) || 'event'}`, timestamp_ms: ts, trade_id: s(v.trade_id), position_id: s(v.position_id), pair: v.pair,
        side: v.side === 'BUY' || v.side === 'SELL' || v.side === 'HOLD' ? v.side : null, event_type: (typeof v.event_type === 'string' ? v.event_type : 'EXECUTION'),
        market_snapshot: { bid: n(m.bid), ask: n(m.ask), mid: n(m.mid), spread_bps: n(m.spread_bps), source: s(m.source), provenance: p(m.provenance) },
        jupiter_quote: { inAmount: s(q.inAmount), outAmount: s(q.outAmount), minOutputAmount: s(q.minOutputAmount), slippageBps: n(q.slippageBps), priceImpactPct: n(q.priceImpactPct), route: a(q.route), routePlan: a(q.routePlan), requestId: s(q.requestId), quotedAtMs: n(q.quotedAtMs), provenance: p(q.provenance) },
        liquidity: { poolTVL: n(l.poolTVL), depth_1pct: n(l.depth_1pct), source: s(l.source), provenance: p(l.provenance) },
        token_data: { volatility_1h: n(t.volatility_1h), volatility_24h: n(t.volatility_24h), source: s(t.source), provenance: p(t.provenance) },
        risk_engine: { maxPosition: n(r.maxPosition), riskScore: n(r.riskScore), decision: r.decision === 'APPROVE' || r.decision === 'REJECT' ? r.decision : null, reason: s(r.reason), provenance: p(r.provenance) },
        execution: { latency_ms: n(e.latency_ms), slippage_bps: n(e.slippage_bps), fee_usd: n(e.fee_usd), fee_lamports: n(e.fee_lamports), success: b(e.success), error_code: s(e.error_code), signature: s(e.signature), confirmation_status: s(e.confirmation_status), provenance: p(e.provenance) },
        pnl: { gross_pnl_usd: n(pn.gross_pnl_usd), net_pnl_usd: n(pn.net_pnl_usd), notional_usd: n(pn.notional_usd), provenance: p(pn.provenance) },
        strategy: st ? { name: s(st.name), version: s(st.version), model_version: s(st.model_version), calibration_version: s(st.calibration_version), feature_version: s(st.feature_version), action: s(st.action), signal_id: s(st.signal_id), probability: n(st.probability), raw_probability: n(st.raw_probability), calibration_status: s(st.calibration_status), calibration_source: s(st.calibration_source), ta_score: n(st.ta_score), fa_score: n(st.fa_score), market_quality_score: n(st.market_quality_score), risk_score: n(st.risk_score), expected_value: n(st.expected_value), entry: n(st.entry), stop_loss: n(st.stop_loss), take_profit: n(st.take_profit), risk_reward: n(st.risk_reward), sample_size: n(st.sample_size), data_quality: s(st.data_quality), regime: s(st.regime), bullish_reasons: Array.isArray(st.bullish_reasons) ? st.bullish_reasons.map(String) : [], bearish_reasons: Array.isArray(st.bearish_reasons) ? st.bearish_reasons.map(String) : [], neutral_reasons: Array.isArray(st.neutral_reasons) ? st.neutral_reasons.map(String) : [] } : null,
        position: { entry_price: n(obj(v.position).entry_price), entry_fee: n(obj(v.position).entry_fee), entry_slippage: n(obj(v.position).entry_slippage), exit_price: n(obj(v.position).exit_price), exit_fee: n(obj(v.position).exit_fee), exit_slippage: n(obj(v.position).exit_slippage), realized_gross_pnl: n(obj(v.position).realized_gross_pnl), realized_net_pnl: n(obj(v.position).realized_net_pnl), unrealized_pnl: n(obj(v.position).unrealized_pnl), tx_signature: s(obj(v.position).tx_signature), provenance: p(obj(v.position).provenance) },
        raw: { quote: raw.quote ?? null, token: raw.token ?? null, simulation: raw.simulation ?? null, chain_meta: raw.chain_meta ?? null }
    };
}
