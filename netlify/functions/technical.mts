import { findTopPool, fetchOHLCV, fetchMultiTimeframe, fetchTokenMarket } from '../../src/market-data/gecko.js';
import { computeTA, taScore } from '../../src/engine/ta.js';
import { loadBacktestSeed } from '../../src/engine/calibration-store.js';
import { loadConfig } from '../../src/config/config.js';
import { Connection } from '@solana/web3.js';
import { collectFundamentals } from '../../src/engine/fundamental.js';
import { ConservativeStrategy } from '../../src/engine/strategy.js';

const aggregate=(candles:any[],minutes:number)=>{
  const bucket=minutes*60_000; const groups=new Map<number,any>();
  for(const c of candles){const k=Math.floor(Number(c.timestampMs)/bucket)*bucket;const g=groups.get(k);if(!g)groups.set(k,{timestampMs:k,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume});else{g.high=Math.max(g.high,c.high);g.low=Math.min(g.low,c.low);g.close=c.close;g.volume+=c.volume;}}
  return [...groups.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
};

export default async function(req: Request) {
  if (req.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const params=new URL(req.url).searchParams; const mint = params.get('mint');
  if (!mint) return Response.json({ error: 'mint_required' }, { status: 400 });
  const timeframe=params.get('timeframe')||'15m'; const includeFundamental=params.get('detail')==='1';
  try {
    const c = loadConfig();
    const pool = await findTopPool(mint);
    let candles:any[];
    if(timeframe==='5m'||timeframe==='15m'||timeframe==='1h'||timeframe==='4h') candles=await fetchOHLCV(pool,timeframe,250);
    else if(timeframe==='30m') candles=aggregate(await fetchOHLCV(pool,'5m',250),30);
    else if(timeframe==='1D') candles=aggregate(await fetchOHLCV(pool,'4h',250),1440);
    else return Response.json({ok:false,mint,error:'TIMEFRAME_UNAVAILABLE',message:'1m is not supported by the existing GeckoTerminal timeframe source.'},{status:422});
    const ta = computeTA(candles); const score = taScore(ta);
    const seed=await loadBacktestSeed(c.BACKTEST_SEED_PATH);
    const probability = score!==null && seed.status==='CALIBRATED' && seed.model ? seed.model.predict(Math.max(0,Math.min(1,score/100))) : null;
    const details = {
      ema9: ta.ema9.value, ema21: ta.ema21.value, ema50: ta.ema50.value, ema200: ta.ema200.value,
      rsi14: ta.rsi14.value, macd: ta.macd.value, macdSignal: ta.macdSignal.value, macdHistogram: ta.macdHistogram.value,
      atr14: ta.atr14.value, normalizedAtr: ta.normalizedAtr.value, volatilityRegime: ta.volatilityRegime.value,
      breakout: ta.breakout.value, breakdown: ta.breakdown.value, support: ta.support.value, resistance: ta.resistance.value,
      relativeVolume: ta.relativeVolume.value, volume: ta.volume.value, volumeChange: ta.volumeChange.value, trendAlignment: ta.trendAlignment.value,
      slope: ta.slope.value, trendStrength: ta.trendStrength.value, source: 'GeckoTerminal OHLCV', candleCount: candles.length,
      lastCandleAtMs: candles.at(-1)?.timestampMs ?? null, probability, probabilityStatus: probability===null?'NOT_CALIBRATED':'CALIBRATED', probabilitySource: probability===null?'NONE':'BACKTEST_SEED'
    };
    let detail:any={};
    if(includeFundamental){
      const market=await fetchTokenMarket(mint); const [fundamental,mtf]=await Promise.all([collectFundamentals(new Connection(c.RPC_URL,{commitment:'confirmed'}),mint,{liquidityUsd:market.liquidityUsd,fdvUsd:market.fdvUsd,marketCapUsd:market.marketCapUsd}),fetchMultiTimeframe(mint)]);
      const latest=Object.values(mtf).map(cs=>cs.at(-1)?.timestampMs??0);
      const snapshot:any={inputMint:'',outputMint:mint,inputAmountRaw:1n,expectedOutputRaw:1n,timestampMs:Date.now(),source:'GeckoTerminal',freshnessMs:0,valid:Boolean(market.priceUsd&&market.priceUsd>0),priceImpactPct:0,estimatedLiquidityUsd:market.liquidityUsd??0,entryPriceUsd:market.priceUsd??undefined,candleFreshnessMs:Math.max(0,Date.now()-Math.max(...latest))};
      const signal=new ConservativeStrategy().evaluate(snapshot,{nowMs:Date.now(),candlesByTimeframe:mtf,fundamental});
      detail={market,fundamental,canonical:{taScore:signal.taScore,faScore:signal.faScore,marketQualityScore:signal.marketQualityScore,regime:signal.regime,bullishReasons:signal.bullishReasons,bearishReasons:signal.bearishReasons,neutralReasons:signal.neutralReasons,dataQuality:signal.dataQuality}};
    }
    return Response.json({ ok:true,mint,pool,score,provenance: score===null?'INSUFFICIENT_OHLCV':'OHLCV_DERIVED',probability,probabilityStatus:probability===null?'NOT_CALIBRATED':'CALIBRATED',probabilitySource:probability===null?'NONE':'BACKTEST_SEED',timeframe,details,candles:candles.slice(-160),updatedAtMs:Date.now(),...detail }, { headers:{'cache-control':includeFundamental?'private, max-age=15':'no-store'} });
  } catch (e) {
    return Response.json({ ok:false, mint, score:null, provenance:'UNAVAILABLE', error:e instanceof Error ? e.message : 'TECHNICAL_UNAVAILABLE', updatedAtMs:Date.now() }, { status:503, headers:{'cache-control':'no-store'} });
  }
}
