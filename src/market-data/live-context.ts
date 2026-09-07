import type {Connection} from '@solana/web3.js';
import type {Config} from '../config/config.js';
import type {MarketSnapshot,StrategyDecisionContext,QuoteSummary} from '../domain/types.js';
import {fetchMultiTimeframe,fetchTokenMarket} from './gecko.js';
import {collectFundamentals} from '../engine/fundamental.js';
import {loadCalibrationFromEvents,loadPaperCalibrationFromEvents,loadPaperCalibrationFromReplay,loadCalibrationFromReplay,loadBacktestSeed} from '../engine/calibration-store.js';
import {SupabaseEventStore} from '../persistence/event-store.js';
import type {CalibrationSource} from '../domain/types.js';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export async function buildLiveDecisionContext(c:Config,connection:Connection,quote:QuoteSummary,inputMint:string,outputMint:string,inputDecimals:number,outputDecimals:number,now=Date.now(),analysisMint=outputMint):Promise<{market:MarketSnapshot;context:StrategyDecisionContext;calibrationSource:CalibrationSource}> {
 const replayPromise=c.SUPABASE_URL&&(c.SUPABASE_KEY||c.SUPABASE_SECRET_KEY||c.SUPABASE_SERVICE_ROLE_KEY)?new SupabaseEventStore(c).getReplayEvents():Promise.resolve(null);
 const [candlesByTimeframe,tokenMarket,replayEvents]=await Promise.all([fetchMultiTimeframe(analysisMint),fetchTokenMarket(analysisMint),replayPromise]);
 const paperCal= c.mode==='PAPER' ? (replayEvents?loadPaperCalibrationFromEvents(replayEvents):await loadPaperCalibrationFromReplay(c.REPLAY_DATASET_PATH||'datasets/budsky-replay.json')) : null; const cal= c.mode==='PAPER' ? (paperCal?.status==='CALIBRATED'?paperCal:await loadBacktestSeed(c.BACKTEST_SEED_PATH)) : (replayEvents?loadCalibrationFromEvents(replayEvents):await loadCalibrationFromReplay(c.REPLAY_DATASET_PATH||'datasets/budsky-replay.json',c.BACKTEST_SEED_PATH));
 const latestCandleMs=Math.max(...Object.values(candlesByTimeframe).map(cs=>cs.at(-1)?.timestampMs??0));
 const entryPrice=quote.outAmount>0n?(outputMint===USDC?(Number(quote.outAmount)/10**outputDecimals)/(Number(quote.inAmount)/10**inputDecimals):(Number(quote.inAmount)/10**inputDecimals)/(Number(quote.outAmount)/10**outputDecimals)):tokenMarket.priceUsd??null;
 const lastCandle=Object.values(candlesByTimeframe).at(-1);
 const market:MarketSnapshot={inputMint,outputMint,inputAmountRaw:quote.inAmount,expectedOutputRaw:quote.outAmount,timestampMs:now,source:'Jupiter + GeckoTerminal',freshnessMs:Math.max(0,now-quote.timestampMs),candleFreshnessMs:Math.max(0,now-latestCandleMs),valid:quote.outAmount>0n,priceImpactPct:quote.priceImpactPct,estimatedLiquidityUsd:tokenMarket.liquidityUsd??0,...(entryPrice!==null?{entryPriceUsd:entryPrice}:{}),...(lastCandle?{candles:lastCandle}: {})};
 const fundamental=await collectFundamentals(connection,analysisMint,tokenMarket);
 const context:StrategyDecisionContext={nowMs:now,candlesByTimeframe,fundamental,sampleSize:cal.sampleSize,calibrationSource:cal.source,riskAdjustment:Math.max(0.5,1-(c.MAX_SLIPPAGE_BPS+30)/10000),...(cal.model?{calibrationModel:cal.model}:{}),...(cal.baseWinRate!==null?{probabilityBaseRate:cal.baseWinRate}:{}),...(cal.regimeMultiplier!==null?{regimeMultiplier:cal.regimeMultiplier}:{})};
 return {market,context,calibrationSource:cal.source};
}
