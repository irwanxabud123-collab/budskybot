import type {Candle} from '../engine/ta.js';
import type {MarketSnapshot} from '../domain/types.js';
const BASE='https://api.geckoterminal.com/api/v2',ACCEPT='application/json;version=20230203',TTL=120_000,STALE_CACHE_MAX=300_000;
interface CacheEntry<T>{at:number;value:T} const cache=new Map<string,CacheEntry<unknown>>();
async function getJson<T>(url:string,maxAge=TTL):Promise<T>{const hit=cache.get(url) as CacheEntry<T>|undefined;if(hit&&Date.now()-hit.at<maxAge)return hit.value;try{const r=await fetch(url,{headers:{accept:ACCEPT},signal:AbortSignal.timeout(7000)});if(!r.ok)throw new Error(`GECKO_${r.status}`);const v=await r.json() as T;cache.set(url,{at:Date.now(),value:v});return v;}catch(e){if(hit&&Date.now()-hit.at<STALE_CACHE_MAX)return hit.value;throw e;}}
interface TokenPools{data?:Array<{id:string;attributes?:{address?:string;reserve_in_usd?:string}}>|null}
interface Ohlcv{data?:{attributes?:{ohlcv_list?:number[][]}}}
interface TokenInfo{data?:{attributes?:{price_usd?:string;fdv_usd?:string;market_cap_usd?:string;total_reserve_in_usd?:string}}}
function tfParams(tf:string){switch(tf){case'5m':return 'minute?aggregate=5';case'15m':return 'minute?aggregate=15';case'1h':return 'hour?aggregate=1';case'4h':return 'hour?aggregate=4';default:throw new Error(`UNSUPPORTED_TIMEFRAME:${tf}`)}}
interface TokenDataResponse{data?:{attributes?:{top_pools?:string[]};relationships?:{top_pools?:{data?:Array<{id?:string}>}}}}
export async function findTopPool(mint:string):Promise<string>{
  try{
    const token=await getJson<TokenDataResponse>(`${BASE}/networks/solana/tokens/${mint}`);
    const rel=token.data?.relationships?.top_pools?.data?.[0]?.id;
    const attr=token.data?.attributes?.top_pools?.[0];
    const pool=(rel??attr)?.split('_').pop();
    if(pool)return pool;
  }catch{}
  const x=await getJson<TokenPools>(`${BASE}/networks/solana/tokens/${mint}/pools`);
  const pools=(x.data??[]).slice().sort((a,b)=>Number(b.attributes?.reserve_in_usd??0)-Number(a.attributes?.reserve_in_usd??0));
  const pool=pools[0]?.attributes?.address??pools[0]?.id?.split('_').pop();
  if(!pool)throw new Error('GECKO_POOL_NOT_FOUND');
  return pool;
}
export async function fetchOHLCV(pool:string,timeframe:string,limit=250):Promise<Candle[]>{const x=await getJson<Ohlcv>(`${BASE}/networks/solana/pools/${pool}/ohlcv/${tfParams(timeframe)}&limit=${Math.min(limit,1000)}&currency=usd`);const rows=x.data?.attributes?.ohlcv_list??[];const out=rows.map(r=>({timestampMs:Number(r[0])*1000,open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])})).filter(c=>[c.timestampMs,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.open>0&&c.high>0&&c.low>0&&c.close>0).sort((a,b)=>a.timestampMs-b.timestampMs);if(out.length<50)throw new Error(`GECKO_OHLCV_INSUFFICIENT:${timeframe}:${out.length}`);return out;}
export async function fetchMultiTimeframe(mint:string):Promise<Record<string,Candle[]>>{const pool=await findTopPool(mint);const out:Record<string,Candle[]>={};for(const tf of ['4h','1h','15m','5m'])out[tf]=await fetchOHLCV(pool,tf,250);return out;}
export async function fetchTokenMarket(mint:string):Promise<{priceUsd:number|null;fdvUsd:number|null;marketCapUsd:number|null;liquidityUsd:number|null;pool:string}>{const pool=await findTopPool(mint);const x=await getJson<TokenInfo>(`${BASE}/networks/solana/tokens/${mint}`);const a=x.data?.attributes;return {priceUsd:a?.price_usd?Number(a.price_usd):null,fdvUsd:a?.fdv_usd?Number(a.fdv_usd):null,marketCapUsd:a?.market_cap_usd?Number(a.market_cap_usd):null,liquidityUsd:a?.total_reserve_in_usd?Number(a.total_reserve_in_usd):null,pool};}
export function marketFromQuote(inputMint:string,outputMint:string,inputAmountRaw:bigint,expectedOutputRaw:bigint,timestampMs:number,source:string,priceImpactPct:number,liquidityUsd:number,inputDecimals:number,outputDecimals:number,entryPriceUsd:number|null):MarketSnapshot{const base={inputMint,outputMint,inputAmountRaw,expectedOutputRaw,timestampMs,source,freshnessMs:0,valid:expectedOutputRaw>0n,priceImpactPct,estimatedLiquidityUsd:liquidityUsd};return entryPriceUsd===null?base:{...base,entryPriceUsd};}
