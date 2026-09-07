export type DataProvenance = 'OBSERVED' | 'DERIVED' | 'MISSING';
export type ReplayEventType = 'MARKET'|'SIGNAL'|'QUOTE'|'EXECUTION'|'POSITION_OPEN'|'POSITION_CLOSE'|'POSITION_UPDATE'|'RECONCILIATION';

export interface ReplayMarketSnapshot { bid:number|null; ask:number|null; mid:number|null; spread_bps:number|null; source:string|null; provenance:DataProvenance; }
export interface ReplayJupiterQuote { inAmount:string|null; outAmount:string|null; minOutputAmount:string|null; slippageBps:number|null; priceImpactPct:number|null; route:unknown[]|null; routePlan:unknown[]|null; requestId:string|null; quotedAtMs:number|null; provenance:DataProvenance; }
export interface ReplayLiquidity { poolTVL:number|null; depth_1pct:number|null; source:string|null; provenance:DataProvenance; }
export interface ReplayTokenData { volatility_1h:number|null; volatility_24h:number|null; source:string|null; provenance:DataProvenance; }
export interface ReplayRiskEngine { maxPosition:number|null; riskScore:number|null; decision:'APPROVE'|'REJECT'|null; reason:string|null; provenance:DataProvenance; }
export interface ReplayExecution { latency_ms:number|null; slippage_bps:number|null; fee_usd:number|null; fee_lamports:number|null; success:boolean|null; error_code:string|null; signature:string|null; confirmation_status:string|null; provenance:DataProvenance; }
export interface ReplayPnl { gross_pnl_usd:number|null; net_pnl_usd:number|null; notional_usd:number|null; provenance:DataProvenance; }
export interface ReplayStrategy { name:string|null; version:string|null; model_version:string|null; calibration_version:string|null; feature_version:string|null; action:string|null; signal_id:string|null; probability:number|null; raw_probability:number|null; calibration_status:string|null; calibration_source:string|null; ta_score:number|null; fa_score:number|null; market_quality_score:number|null; risk_score:number|null; expected_value:number|null; entry:number|null; stop_loss:number|null; take_profit:number|null; risk_reward:number|null; sample_size:number|null; data_quality:string|null; regime:string|null; bullish_reasons:string[]; bearish_reasons:string[]; neutral_reasons:string[]; }
export interface ReplayPosition { entry_price:number|null; entry_fee:number|null; entry_slippage:number|null; exit_price:number|null; exit_fee:number|null; exit_slippage:number|null; realized_gross_pnl:number|null; realized_net_pnl:number|null; unrealized_pnl:number|null; tx_signature:string|null; provenance:DataProvenance; }
export type ExecutionMode = 'PAPER_SIMULATED'|'ON_CHAIN';
export interface ReplayEvent {
  execution_mode?:ExecutionMode | undefined;
  schema_version:'2.0.0'; event_id:string; timestamp_ms:number; trade_id:string|null; position_id:string|null; pair:string; side:'BUY'|'SELL'|'HOLD'|null; event_type:ReplayEventType;
  market_snapshot:ReplayMarketSnapshot; jupiter_quote:ReplayJupiterQuote; liquidity:ReplayLiquidity; token_data:ReplayTokenData; risk_engine:ReplayRiskEngine; execution:ReplayExecution; pnl:ReplayPnl;
  strategy:ReplayStrategy|null;
  position:ReplayPosition;
  raw:{quote:unknown|null; token:unknown|null; simulation:unknown|null; chain_meta:unknown|null};
}
export interface ReplayDataset { schema_version:'2.0.0'; status:'READY'|'NEED LIVE DATA'; source:'LIVE'|'PAPER'|'REPLAY'; initial_capital_usd:number|null; events:ReplayEvent[]; }

const n=(x:unknown)=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const s=(x:unknown)=>x===null||x===undefined?null:String(x);
const b=(x:unknown)=>x===null||x===undefined?null:Boolean(x);
const a=(x:unknown)=>Array.isArray(x)?x:null;
const p=(x:unknown):DataProvenance=>x==='OBSERVED'||x==='DERIVED'||x==='MISSING'?x:'MISSING';
const obj=(x:unknown)=>x&&typeof x==='object'?x as Record<string,unknown>:{};

export function normalizeEvent(value:unknown):ReplayEvent {
  if(!value||typeof value!=='object')throw new Error('REPLAY_EVENT_INVALID');
  const v=value as Record<string,unknown>; const m=obj(v.market_snapshot),q=obj(v.jupiter_quote),l=obj(v.liquidity),t=obj(v.token_data),r=obj(v.risk_engine),e=obj(v.execution),pn=obj(v.pnl),st=v.strategy&&typeof v.strategy==='object'?obj(v.strategy):null,raw=obj(v.raw);
  const ts=Number(v.timestamp_ms); if(!Number.isFinite(ts)||ts<=0)throw new Error('REPLAY_TIMESTAMP_INVALID');
  if(typeof v.pair!=='string'||!/^[^/\s]+\/[^/\s]+$/.test(v.pair))throw new Error('REPLAY_PAIR_INVALID');
  return {
    execution_mode:v.execution_mode==='PAPER_SIMULATED'||v.execution_mode==='ON_CHAIN'?v.execution_mode:undefined,
    schema_version:'2.0.0', event_id:s(v.event_id)||`${ts}-${s(v.trade_id)||'event'}`, timestamp_ms:ts, trade_id:s(v.trade_id), position_id:s(v.position_id), pair:v.pair,
    side:v.side==='BUY'||v.side==='SELL'||v.side==='HOLD'?v.side:null, event_type:(typeof v.event_type==='string'?v.event_type:'EXECUTION') as ReplayEventType,
    market_snapshot:{bid:n(m.bid),ask:n(m.ask),mid:n(m.mid),spread_bps:n(m.spread_bps),source:s(m.source),provenance:p(m.provenance)},
    jupiter_quote:{inAmount:s(q.inAmount),outAmount:s(q.outAmount),minOutputAmount:s(q.minOutputAmount),slippageBps:n(q.slippageBps),priceImpactPct:n(q.priceImpactPct),route:a(q.route),routePlan:a(q.routePlan),requestId:s(q.requestId),quotedAtMs:n(q.quotedAtMs),provenance:p(q.provenance)},
    liquidity:{poolTVL:n(l.poolTVL),depth_1pct:n(l.depth_1pct),source:s(l.source),provenance:p(l.provenance)},
    token_data:{volatility_1h:n(t.volatility_1h),volatility_24h:n(t.volatility_24h),source:s(t.source),provenance:p(t.provenance)},
    risk_engine:{maxPosition:n(r.maxPosition),riskScore:n(r.riskScore),decision:r.decision==='APPROVE'||r.decision==='REJECT'?r.decision:null,reason:s(r.reason),provenance:p(r.provenance)},
    execution:{latency_ms:n(e.latency_ms),slippage_bps:n(e.slippage_bps),fee_usd:n(e.fee_usd),fee_lamports:n(e.fee_lamports),success:b(e.success),error_code:s(e.error_code),signature:s(e.signature),confirmation_status:s(e.confirmation_status),provenance:p(e.provenance)},
    pnl:{gross_pnl_usd:n(pn.gross_pnl_usd),net_pnl_usd:n(pn.net_pnl_usd),notional_usd:n(pn.notional_usd),provenance:p(pn.provenance)},
    strategy:st?{name:s(st.name),version:s(st.version),model_version:s(st.model_version),calibration_version:s(st.calibration_version),feature_version:s(st.feature_version),action:s(st.action),signal_id:s(st.signal_id),probability:n(st.probability),raw_probability:n(st.raw_probability),calibration_status:s(st.calibration_status),calibration_source:s(st.calibration_source),ta_score:n(st.ta_score),fa_score:n(st.fa_score),market_quality_score:n(st.market_quality_score),risk_score:n(st.risk_score),expected_value:n(st.expected_value),entry:n(st.entry),stop_loss:n(st.stop_loss),take_profit:n(st.take_profit),risk_reward:n(st.risk_reward),sample_size:n(st.sample_size),data_quality:s(st.data_quality),regime:s(st.regime),bullish_reasons:Array.isArray(st.bullish_reasons)?st.bullish_reasons.map(String):[],bearish_reasons:Array.isArray(st.bearish_reasons)?st.bearish_reasons.map(String):[],neutral_reasons:Array.isArray(st.neutral_reasons)?st.neutral_reasons.map(String):[]}:null,
    position:{entry_price:n(obj(v.position).entry_price),entry_fee:n(obj(v.position).entry_fee),entry_slippage:n(obj(v.position).entry_slippage),exit_price:n(obj(v.position).exit_price),exit_fee:n(obj(v.position).exit_fee),exit_slippage:n(obj(v.position).exit_slippage),realized_gross_pnl:n(obj(v.position).realized_gross_pnl),realized_net_pnl:n(obj(v.position).realized_net_pnl),unrealized_pnl:n(obj(v.position).unrealized_pnl),tx_signature:s(obj(v.position).tx_signature),provenance:p(obj(v.position).provenance)},
    raw:{quote:raw.quote??null,token:raw.token??null,simulation:raw.simulation??null,chain_meta:raw.chain_meta??null}
  };
}
