import {readFile} from 'node:fs/promises';
import {deserializeCalibrationModel,type CalibrationModel,type SerializedCalibrationModel,fitIsotonic} from './calibration.js';
import type {CalibrationSource} from '../domain/types.js';

type ReplayRow={execution_mode?:string;event_type?:string;timestamp_ms?:number;strategy?:{raw_probability?:number;regime?:string};pnl?:{net_pnl_usd?:number};position?:{realized_net_pnl?:number;provenance?:string}};
export interface LoadedCalibration {model:CalibrationModel|null;sampleSize:number;status:'CALIBRATED'|'INSUFFICIENT_DATA';source:CalibrationSource;baseWinRate:number|null;regimeMultiplier:number|null;artifactPath:string|null;}
const empty=(source:CalibrationSource='NONE'):LoadedCalibration=>({model:null,sampleSize:0,status:'INSUFFICIENT_DATA',source,baseWinRate:null,regimeMultiplier:null,artifactPath:null});
async function readJson(path:string):Promise<any|null>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}}

function fromRows(events:unknown[],minSamples:number,source:'LIVE_REPLAY'|'PAPER_REPLAY',allowedMode:'ON_CHAIN'|'PAPER_SIMULATED'):LoadedCalibration {
 const rows=(events as ReplayRow[]).filter(e=>e?.event_type==='POSITION_CLOSE'&&e?.execution_mode===allowedMode&&typeof e?.strategy?.raw_probability==='number'&&typeof e?.pnl?.net_pnl_usd==='number'&&e?.position?.provenance!=='MISSING'&&typeof e?.position?.realized_net_pnl==='number').sort((a,b)=>Number(a.timestamp_ms)-Number(b.timestamp_ms));
 if(rows.length<minSamples)return empty(source);
 const split=Math.floor(rows.length*0.7),train=rows.slice(0,split);if(train.length<minSamples)return empty(source);
 const outcomes=train.map(e=>e.pnl!.net_pnl_usd!>0),model=fitIsotonic(train.map(e=>e.strategy!.raw_probability!),outcomes);if(!model)return empty(source);
 const baseWinRate=outcomes.filter(Boolean).length/outcomes.length;const regimeRows=train.filter(e=>typeof e.strategy?.regime==='string'&&e.strategy.regime!=='UNKNOWN');const regimeWins=regimeRows.filter(e=>e.pnl!.net_pnl_usd!>0).length;const regimeRate=regimeRows.length?regimeWins/regimeRows.length:null;const regimeMultiplier=regimeRate===null||baseWinRate===0?null:Math.max(0.5,Math.min(1.5,regimeRate/baseWinRate));
 return {model,sampleSize:train.length,status:'CALIBRATED',source,baseWinRate,regimeMultiplier,artifactPath:null};
}
export function loadCalibrationFromEvents(events:unknown[],minSamples=100):LoadedCalibration{return fromRows(events,minSamples,'LIVE_REPLAY','ON_CHAIN');}
export function loadPaperCalibrationFromEvents(events:unknown[],minSamples=100):LoadedCalibration{return fromRows(events,minSamples,'PAPER_REPLAY','PAPER_SIMULATED');}

export async function loadBacktestSeed(seedPath:string,minSamples=100):Promise<LoadedCalibration>{
 const seed=await readJson(seedPath);const artifact=(seed?.seedCalibration??seed) as {source?:string;strategyVersion?:string;featureVersion?:string;methodology?:string;trainingSamples?:number;model?:SerializedCalibrationModel};
 if(artifact?.source==='BACKTEST_SEED'&&artifact.strategyVersion==='budsky-v9.0.0'&&artifact.featureVersion==='ta-fa-v1.1'&&artifact.methodology==='ATR_TRADE_OUTCOME'&&artifact.model){const model=deserializeCalibrationModel(artifact.model);const n=Number(artifact.trainingSamples??artifact.model.n);if(model&&n>=minSamples)return {model,sampleSize:n,status:'CALIBRATED',source:'BACKTEST_SEED',baseWinRate:null,regimeMultiplier:null,artifactPath:seedPath};}
 return empty('NONE');
}


export async function loadPaperCalibrationFromReplay(replayPath:string,minSamples=100):Promise<LoadedCalibration>{
 const data=await readJson(replayPath); return loadPaperCalibrationFromEvents(data?.events??[],minSamples);
}

export async function loadCalibrationFromReplay(replayPath:string,seedPath:string,minSamples=100):Promise<LoadedCalibration>{
 const live=await readJson(replayPath);const liveCal=fromRows(live?.events??[],minSamples,'LIVE_REPLAY','ON_CHAIN');if(liveCal.status==='CALIBRATED')return {...liveCal,artifactPath:replayPath};
 const seedCal=await loadBacktestSeed(seedPath,minSamples);if(seedCal.status==='CALIBRATED')return seedCal;
 return empty(liveCal.source==='LIVE_REPLAY'?'LIVE_REPLAY':'NONE');
}
