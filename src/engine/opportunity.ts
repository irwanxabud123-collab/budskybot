export interface TokenStats {
  priceChange?: number;
  volumeChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numNetBuyers?: number;
}

export interface ScanToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  isVerified?: boolean;
  organicScore?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  usdPrice?: number;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; isSus?: boolean };
  tags?: string[];
  stats5m?: TokenStats;
  stats1h?: TokenStats;
  stats6h?: TokenStats;
  stats24h?: TokenStats;
}

export interface Opportunity {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  priceUsd: number;
  change24h: number;
  liquidityUsd: number;
  opportunityScore: number;
  technicalScore: number | null;
  marketScore: number | null;
  riskScore: number;
  confidence: number | null;
  technicalProvenance: 'MISSING' | 'OHLCV_DERIVED' | 'ON_DEMAND' | 'INSUFFICIENT_OHLCV' | 'UNAVAILABLE';
  probabilityStatus: 'UNAVAILABLE' | 'NOT_CALIBRATED' | 'CALIBRATED';
  probability?: number | null;
  technicalError?: string | null;
  technicalDetails?: {rsi14:number|null;macdHistogram:number|null;trendAlignment:number|null;relativeVolume:number|null;breakout:boolean|null;breakdown:boolean|null;source:string;candleCount?:number;lastCandleAtMs?:number|null};
  category: 'LARGE_CAP' | 'ALTCOIN' | 'MEME' | 'OTHER';
  status: 'WATCH' | 'CANDIDATE' | 'AVOID';
  reasons: string[];
  updatedAtMs: number;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  buyVolume24hUsd: number | null;
  sellVolume24hUsd: number | null;
  netVolume24hUsd: number | null;
  holders: number | null;
  holderChange24h: number | null;
  scoreBreakdown?: { momentumProxy:number; marketScore:number|null; riskScore:number; technicalScore:number|null };
}

const clamp = (n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const safe = (n:unknown, fallback=0)=>typeof n==='number' && Number.isFinite(n)?n:fallback;

function technical(t:ScanToken){
  // Jupiter token statistics are not OHLCV candles. They are retained as discovery/momentum
  // context only and are explicitly NOT labelled as technical analysis.
  return null as number|null;
}

function market(t:ScanToken){
  const organic=typeof t.organicScore==='number'&&Number.isFinite(t.organicScore)?clamp(t.organicScore):null;
  const liquidity = t.liquidity && t.liquidity>0 ? clamp(35 + Math.log10(t.liquidity)*8) : null;
  const verified = t.isVerified===undefined ? null : (t.isVerified ? 100 : 55);
  if(organic===null || liquidity===null || verified===null) return null;
  return Math.round(clamp(organic*0.45 + liquidity*0.35 + verified*0.20));
}

function risk(t:ScanToken){
  const liq=t.liquidity||0;
  let score=clamp(45 + Math.log10(Math.max(liq,1))*8);
  if(t.isVerified) score += 8;
  if(t.audit?.mintAuthorityDisabled) score += 7;
  if(t.audit?.freezeAuthorityDisabled) score += 7;
  if(t.audit?.isSus) score -= 45;
  const holders=t.audit?.topHoldersPercentage;
  if(typeof holders==='number') score -= Math.max(0,holders-20)*1.2;
  const change=Math.abs(safe(t.stats5m?.priceChange));
  score -= Math.min(25,change*2.5);
  return Math.round(clamp(score));
}

function category(t:ScanToken):Opportunity['category']{
  const tags=(t.tags||[]).join(' ').toLowerCase();
  const s=t.symbol.toLowerCase(); const n=t.name.toLowerCase();
  if(tags.includes('meme') || /bonk|wif|doge|shib|pepe|meme/.test(s+' '+n)) return 'MEME';
  if((t.mcap||0)>1_000_000_000) return 'LARGE_CAP';
  if((t.mcap||0)>50_000_000) return 'ALTCOIN';
  return 'OTHER';
}

export function scoreOpportunity(t:ScanToken, nowMs=Date.now()):Opportunity{
  const technicalScore=technical(t), marketScore=market(t), riskScore=risk(t);
  const momentumProxy = clamp(50 + safe(t.stats1h?.priceChange)*1.5 + safe(t.stats24h?.priceChange)*0.25);
  const opportunityScore=Math.round(momentumProxy*0.35 + (marketScore??0)*0.35 + riskScore*0.30);
  const s24:any=t.stats24h||{};
  const rawVolume=Number(s24.volume ?? s24.volumeUsd ?? s24.totalVolume ?? NaN);
  const buyVolume=Number(s24.buyVolume ?? s24.buy_volume ?? NaN);
  const sellVolume=Number(s24.sellVolume ?? s24.sell_volume ?? NaN);
  const netVolume=Number.isFinite(buyVolume)&&Number.isFinite(sellVolume)?buyVolume-sellVolume:null;
  const rawHolders=Number((t as any).holderCount ?? (t as any).holders ?? s24.holderCount ?? s24.holders ?? NaN);
  const holderChange=Number((t as any).holderChange24h ?? (t as any).holderChange ?? s24.holderChange24h ?? s24.holderChange ?? NaN);
  const reasons:string[]=[];
  if(momentumProxy>=75) reasons.push('Short-term momentum proxy is strong; OHLCV TA is not available from this scanner');
  if(safe(t.stats1h?.buyVolume)>safe(t.stats1h?.sellVolume)) reasons.push('1h buy flow is stronger than sell flow');
  if((t.liquidity||0)>=5_000_000) reasons.push('Deep liquidity supports better execution');
  if((t.organicScore||0)>=80) reasons.push('High organic activity score');
  if(t.isVerified) reasons.push('Verified token');
  if(t.audit?.isSus) reasons.push('Jupiter flags suspicious characteristics');
  if((t.liquidity||0)<250_000) reasons.push('Liquidity is low');
  if(Math.abs(safe(t.stats5m?.priceChange))>8) reasons.push('Very high short-term volatility');
  if(reasons.length===0) reasons.push('Mixed signals; monitor before entering');
  const status = t.audit?.isSus || (t.liquidity||0)<100_000 || riskScore<35 ? 'AVOID' : opportunityScore>=78 ? 'CANDIDATE' : 'WATCH';
  return {mint:t.id,symbol:t.symbol,name:t.name,...(t.icon ? {icon:t.icon} : {}),priceUsd:safe(t.usdPrice),change24h:safe(t.stats24h?.priceChange),liquidityUsd:safe(t.liquidity),opportunityScore,technicalScore,marketScore,riskScore,confidence:null,technicalProvenance:'MISSING',probabilityStatus:'UNAVAILABLE',category:category(t),status,reasons,updatedAtMs:nowMs,marketCapUsd:Number.isFinite(Number(t.mcap))?Number(t.mcap):null,fdvUsd:Number.isFinite(Number(t.fdv))?Number(t.fdv):null,volume24hUsd:Number.isFinite(rawVolume)?rawVolume:null,buyVolume24hUsd:Number.isFinite(buyVolume)?buyVolume:null,sellVolume24hUsd:Number.isFinite(sellVolume)?sellVolume:null,netVolume24hUsd:netVolume,holders:Number.isFinite(rawHolders)?rawHolders:null,holderChange24h:Number.isFinite(holderChange)?holderChange:null,scoreBreakdown:{momentumProxy,marketScore,riskScore,technicalScore}};
}
