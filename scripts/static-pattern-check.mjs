import {readFile} from 'node:fs/promises';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';

async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','dist','.git'].includes(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(/\.(ts|mts|mjs|js)$/.test(e.name))out.push(p);}return out;}
const files=(await walk('.')).filter(f=>f!=='scripts/static-pattern-check.mjs');
const text=await Promise.all(files.map(async f=>[f,await readFile(f,'utf8')]));
const joined=text.map(([f,s])=>`\n--- ${f}\n${s}`).join('\n');
console.log('STATIC PATTERN CHECK — source-level regex checks only; not a functional audit');
const checks=[
 ['no hardcoded confidence 0.6',/confidence\s*[:=]\s*0\.6(?!\d)/,false],
 ['no organicScore/confidence coupling',/organicScore[^\n]{0,180}confidence|confidence[^\n]{0,180}organicScore/,false],
 ['no Math.random production',/Math\.random\s*\(/,false],
 ['no environment keypair signer',/EnvKeypairSigner|LIVE_SIGNER_SECRET_KEY_B64|DEV_SIGNER_SECRET_KEY_B64/,false],
 ['calibration seed source',/BACKTEST_SEED|calibrationSource/,true],
 ['canonical strategy',/budsky-canonical-v9/,true],
 ['calibration engine',/fitIsotonic|fitPlatt/,true],
 ['BUY SELL HOLD model',/SignalAction = 'BUY' \| 'SELL' \| 'HOLD'/,true],
 ['SL/TP contract',/stopLoss: number \| null;[\s\S]{0,120}takeProfit: number \| null;/,true],
 ['raw probability is persisted',/rawProbability|raw_probability/,true],
 ['signal disclaimer',/not a guarantee of profit/,true],
 ['multi-timeframe collector',/fetchMultiTimeframe|candlesByTimeframe/,true],
 ['real OHLCV provider',/api\.geckoterminal\.com/,true],
 ['on-chain fundamentals',/getTokenSupply[\s\S]{0,500}getTokenLargestAccounts/,true],
 ['calibration sample gate',/minSampleSize[^\n]{0,120}100/,true],
 ['backtest ATR outcome model',/ATR_TRADE_OUTCOME|STOP_LOSS|TAKE_PROFIT/,true],
 ['backtest risk sizing',/riskPerTradePct|maxPositionUsd|maxTotalExposureUsd/,true],
 ['token hard-block policy',/TOKEN_2022_BLOCKED|MINT_AUTHORITY_HARD_BLOCK|FREEZE_AUTHORITY_HARD_BLOCK/,true],
 ['fail closed missing probability',/PROBABILITY_NOT_CALIBRATED/,true],
 ['exit risk gate',/approveExit\(/,true],
 ['candle freshness gate',/MAX_CANDLE_DATA_AGE_MS|STALE_CANDLE_DATA/,true],
 ['paper no hidden defaults',/source:'JUPITER_QUOTE'/,true],
 ['no live default',/MODE.*default\('DRY_RUN'\)/,true],
 ['no whole-wallet exposure',/deployableLamports/,false],
 ['health checks RPC',/getLatestBlockhash\('confirmed'\)/,true],
];
let failed=false;for(const [name,re,required] of checks){const hit=re.test(joined);const ok=required?hit:!hit;console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}
process.exitCode=failed?1:0;
