import { scoreOpportunity, type ScanToken, type Opportunity } from '../../src/engine/opportunity.js';
import { findTopPool, fetchOHLCV } from '../../src/market-data/gecko.js';
import { computeTA, taScore } from '../../src/engine/ta.js';

const BASE='https://api.jup.ag';
const cache = new Map<string,{at:number,data:unknown}>();
const TTL=20_000;

async function jup(path:string){
  const key=process.env.JUPITER_API_KEY||'';
  if(!key) throw new Error('JUPITER_API_KEY is required for real-time market scanning');

  const r=await fetch(`${BASE}${path}`,{
    headers:{'x-api-key':key},
    signal:AbortSignal.timeout(7000)
  });

  if(!r.ok) throw new Error(`JUPITER_${r.status}`);

  return r.json();
}

const technicalCache=new Map<string,{at:number;value:Partial<Opportunity>}>();
const TECHNICAL_TTL=120_000;

async function enrichTechnical(opportunities:Opportunity[]):Promise<Opportunity[]>{
  const targets=opportunities.slice(0,3);
  const enriched=new Map<string,Partial<Opportunity>>();

  for(const o of targets){
    const hit=technicalCache.get(o.mint);

    if(hit&&Date.now()-hit.at<TECHNICAL_TTL){
      enriched.set(o.mint,hit.value);
      continue;
    }

    try{
      const pool=await findTopPool(o.mint);
      const candles=await fetchOHLCV(pool,'15m',250);
      const ta=computeTA(candles);
      const score=taScore(ta);

      const value:Partial<Opportunity>={
        technicalScore:
          score===null
            ?null
            :Math.round(score),

        technicalProvenance:
          score===null
            ?'INSUFFICIENT_OHLCV'
            :'OHLCV_DERIVED',

        opportunityScore:
          score===null
            ?o.opportunityScore
            :Math.round(
                o.opportunityScore*0.60+
                score*0.40
              ),

        technicalDetails:{
          rsi14:ta.rsi14.value,
          macdHistogram:ta.macdHistogram.value,
          trendAlignment:ta.trendAlignment.value,
          relativeVolume:ta.relativeVolume.value,
          breakout:ta.breakout.value,
          breakdown:ta.breakdown.value,
          source:'GeckoTerminal 15m OHLCV',
          candleCount:candles.length,
          lastCandleAtMs:candles.at(-1)?.timestampMs??null
        },

        probabilityStatus:'NOT_CALIBRATED',
        technicalError:null
      };

      technicalCache.set(o.mint,{
        at:Date.now(),
        value
      });

      enriched.set(o.mint,value);

    }catch(e){
      const value:Partial<Opportunity>={
        technicalScore:null,
        technicalProvenance:'UNAVAILABLE',
        probabilityStatus:'NOT_CALIBRATED',
        technicalError:
          e instanceof Error
            ?e.message
            :'TECHNICAL_UNAVAILABLE'
      };

      technicalCache.set(o.mint,{
        at:Date.now(),
        value
      });

      enriched.set(o.mint,value);
    }
  }

  return opportunities
    .map((x):Opportunity=>{
      const e=enriched.get(x.mint);

      if(e){
        return {
          ...x,
          ...e,
          technicalProvenance:
            e.technicalProvenance ??
            x.technicalProvenance,
          probabilityStatus:
            e.probabilityStatus ??
            x.probabilityStatus
        };
      }

      return {
        ...x,
        technicalProvenance:'ON_DEMAND',
        probabilityStatus:'NOT_CALIBRATED'
      };
    })
    .sort(
      (a,b)=>
        b.opportunityScore-
        a.opportunityScore
    );
}

async function scan(){
  const now=Date.now();
  const cached=cache.get('scan');

  if(cached&&now-cached.at<TTL){
    return cached.data;
  }

  const [
    trending,
    traded,
    organic
  ]=await Promise.all([
    jup('/tokens/v2/toptrending/1h?limit=50'),
    jup('/tokens/v2/toptraded/1h?limit=50'),
    jup('/tokens/v2/toporganicscore/1h?limit=50')
  ]);

  const map=new Map<string,ScanToken>();

  for(
    const row of [
      ...trending,
      ...traded,
      ...organic
    ]
  ){
    if(
      row?.id&&
      !map.has(row.id)
    ){
      map.set(row.id,row);
    }
  }

  let opportunities=[
    ...map.values()
  ]
    .map(t=>scoreOpportunity(t,now))
    .sort(
      (a,b)=>
        b.opportunityScore-
        a.opportunityScore
    );

  opportunities=await enrichTechnical(
    opportunities
  );

  const data={
    updatedAtMs:now,
    source:'Jupiter Tokens API V2',
    universeSize:opportunities.length,
    opportunities,

    discovery:{
      trending:
        Array.isArray(trending)
          ?trending.slice(0,30)
          :[],

      traded:
        Array.isArray(traded)
          ?traded.slice(0,30)
          :[],

      organic:
        Array.isArray(organic)
          ?organic.slice(0,30)
          :[]
    }
  };

  cache.set('scan',{
    at:now,
    data
  });

  return data;
}

export default async (req:Request)=>{
  if(req.method!=='GET'){
    return new Response(
      JSON.stringify({
        error:'METHOD_NOT_ALLOWED'
      }),
      {
        status:405,
        headers:{
          'content-type':
            'application/json'
        }
      }
    );
  }

  try{
    return new Response(
      JSON.stringify(
        await scan()
      ),
      {
        headers:{
          'content-type':
            'application/json',
          'cache-control':
            'no-store'
        }
      }
    );
  }catch(e){
    return new Response(
      JSON.stringify({
        error:
          e instanceof Error
            ?e.message
            :'MARKET_SCAN_FAILED'
      }),
      {
        status:503,
        headers:{
          'content-type':
            'application/json',
          'cache-control':
            'no-store'
        }
      }
    );
  }
};
