#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';

const [network='solana', poolAddress, timeframe='hour', aggregate='1', out='datasets/historical-ohlcv.csv'] = process.argv.slice(2);
if(!poolAddress){
  console.error('USAGE: node scripts/fetch-geckoterminal-ohlcv.mjs <network> <pool_address> [timeframe] [aggregate] [output.csv]');
  process.exit(2);
}
const url=new URL(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/pools/${encodeURIComponent(poolAddress)}/ohlcv/${encodeURIComponent(timeframe)}`);
url.searchParams.set('aggregate',aggregate);
url.searchParams.set('limit','1000');
const res=await fetch(url,{headers:{accept:'application/json;version=20230203'}});
if(!res.ok) throw new Error(`GECKOTERMINAL_HTTP_${res.status}`);
const body=await res.json();
const rows=body?.data?.attributes?.ohlcv_list;
if(!Array.isArray(rows)||rows.length===0) throw new Error('GECKOTERMINAL_OHLCV_EMPTY');
const csv=['timestamp,open,high,low,close,volume'];
for(const row of rows){
  if(!Array.isArray(row)||row.length<6) continue;
  const [ts,open,close,high,low,volume]=row;
  if([ts,open,high,low,close,volume].every(Number.isFinite)) csv.push(`${ts},${open},${high},${low},${close},${volume}`);
}
if(csv.length<2) throw new Error('GECKOTERMINAL_OHLCV_NO_VALID_ROWS');
await writeFile(out,csv.join('\n')+'\n','utf8');
console.log(JSON.stringify({source:'GeckoTerminal',network,poolAddress,timeframe,aggregate,rows:csv.length-1,output:out},null,2));
