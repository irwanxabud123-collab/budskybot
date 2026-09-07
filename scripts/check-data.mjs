import { readFile } from 'node:fs/promises';

function args(){
  const out={};
  for(let i=2;i<process.argv.length;i++){
    const a=process.argv[i];
    if(a.startsWith('--')) out[a.slice(2)]=process.argv[i+1] && !process.argv[i+1].startsWith('--') ? process.argv[++i] : true;
  }
  return out;
}

async function loadEvents(){
  const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.SUPABASE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url&&key){
    const projectRef=new URL(url).hostname.split('.')[0];
    console.log(`Supabase Dashboard: https://supabase.com/dashboard/project/${projectRef}/editor`);
    const r=await fetch(`${url}/rest/v1/replay_events?select=event&order=timestamp_ms.asc&limit=10000`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    if(!r.ok)throw new Error(`SUPABASE_HTTP_${r.status}`);
    const rows=await r.json();return rows.map(x=>x.event);
  }
  const path=process.argv[2]||'datasets/budsky-replay.json';
  const d=JSON.parse(await readFile(path,'utf8'));return d.events||[];
}

const events=await loadEvents();
const opens=events.filter(e=>e?.event_type==='POSITION_OPEN');
const closes=events.filter(e=>e?.event_type==='POSITION_CLOSE');
const idOf=e=>e?.position_id||e?.trade_id;
const openIds=new Set(opens.map(idOf).filter(Boolean));
const closeIds=new Set(closes.map(idOf).filter(Boolean));
let missing=0;
for(const id of openIds)if(!closeIds.has(id))missing++;
for(const id of closeIds)if(!openIds.has(id))missing++;
const pnlMissing=closes.filter(e=>e?.position?.realized_net_pnl===null||e?.position?.realized_net_pnl===undefined).length;
console.log(`Total Events: ${events.length} | Open: ${opens.length} | Close: ${closes.length} | MISSING: ${missing}`);
let failed=false;
if(opens.length!==closes.length||missing>0){console.error(`ERROR: ${missing} posisi menggantung`);failed=true;}
if(pnlMissing>0){console.error(`ERROR: ${pnlMissing} CLOSE tanpa realized_net_pnl`);failed=true;}
if(events.length===0){console.warn('INSUFFICIENT DATA');}
if(failed)process.exitCode=1;
