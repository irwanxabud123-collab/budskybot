import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
const fail=(m)=>{throw new Error(`FUNCTIONAL_AUDIT_FAIL:${m}`)};
const assert=(x,m)=>{if(!x)fail(m)};

const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
assert(pkg.engines?.node==='>=22','node engine');
assert(pkg.scripts?.build==='tsc -p tsconfig.json','build script');
assert(pkg.scripts?.test==='vitest run','test script');
assert(pkg.scripts?.lint==='tsc --noEmit -p tsconfig.json','lint must be full typecheck');

const {fitIsotonic,serializeCalibrationModel,deserializeCalibrationModel}=await import(new URL('../dist/src/engine/calibration.js',import.meta.url));
const raw=Array.from({length:40},(_,i)=>i/39);const outcomes=raw.map(x=>x>=0.55);
const model=fitIsotonic(raw,outcomes);assert(model,'isotonic model creation');
const artifact=serializeCalibrationModel(model);assert(artifact?.points?.length,'serializable calibration seed');
const restored=deserializeCalibrationModel(artifact);assert(restored,'calibration seed round-trip');
assert(Math.abs(restored.predict(0.9)-model.predict(0.9))<1e-12,'calibration prediction round-trip');

const {runSimpleBacktest}=await import(new URL('../dist/src/engine/backtest.js',import.meta.url));
const candles=[];let p=1;for(let i=0;i<320;i++){const trend=i<160?0.001:0.0002;p*=1+trend;const wave=(i%7-3)*0.0004;candles.push({timestampMs:Date.UTC(2026,0,1)+i*300000,open:p,high:p*(1.002+Math.max(0,wave)),low:p*(0.998+Math.min(0,wave)),close:p*(1+wave),volume:1000+i});}
const result=runSimpleBacktest(candles,1000,30,50,{riskPerTradePct:1,maxPositionUsd:100,maxTotalExposureUsd:200});
assert(result.methodology==='canonical-v9-strategy','backtest methodology');
assert(result.metricPeriod==='PER_TRADE_NOT_ANNUALIZED','per-trade metric annotation');
assert(result.maxPositionUsd===100 && result.maxTotalExposureUsd===200,'risk sizing caps');
assert(result.riskPerTradePct===1,'risk percent sizing');
if(result.seedCalibration){assert(result.seedCalibration.source==='BACKTEST_SEED','seed source label');assert(result.seedCalibration.methodology==='ATR_TRADE_OUTCOME','seed outcome methodology');assert(result.seedCalibration.strategyVersion==='budsky-v9.0.0','seed strategy version');}

const env=await readFile(join(root,'.env.example'),'utf8');
assert(/MODE=DRY_RUN/.test(env),'safe MODE default');
assert(/LIVE_ENABLED=false/.test(env),'safe LIVE_ENABLED default');
assert(/LIVE_BROWSER_EXECUTION_ENABLED=false/.test(env),'safe browser execution default');
assert(/ALLOW_BACKTEST_SEED_LIVE=false/.test(env),'safe seed-live default');

const migration=await readFile(join(root,'supabase/migrations/001_trading_bot.sql'),'utf8');
for(const table of ['trades','bot_events','execution_leases','replay_events'])assert(new RegExp(`alter table public\\.${table} enable row level security`,'i').test(migration),`RLS ${table}`);

const logger=await readFile(join(root,'src/replay/logger.ts'),'utf8');assert(/if\(this\.options\.sink\)await this\.options\.sink\.appendReplayEvent/.test(logger),'durable replay sink');
console.log('FUNCTIONAL AUDIT OK');
