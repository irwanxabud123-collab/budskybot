export interface HistoricalProbabilityStats { sampleSize:number; baseWinRate:number|null; regimeMultiplier:number|null; }
export function buildRawProbability(stats:HistoricalProbabilityStats,taScore:number|null,riskReward:number|null):number|null {
 if(stats.sampleSize<100||stats.baseWinRate===null||stats.regimeMultiplier===null||taScore===null)return null;
 const taFactor=0.8+taScore/250; const rrFactor=riskReward===null?1:Math.max(0.5,Math.min(1.5,riskReward/2));
 return Math.max(0.001,Math.min(0.999,stats.baseWinRate*stats.regimeMultiplier*taFactor*rrFactor));
}
export function regimeMultiplierFromHistorical(winRates:number[],globalWinRate:number|null,minSamples=30):number|null {if(globalWinRate===null||winRates.length<minSamples||globalWinRate<=0)return null;const r=winRates.reduce((a,b)=>a+b,0)/winRates.length;return Math.max(0.5,Math.min(1.5,r/globalWinRate));}
