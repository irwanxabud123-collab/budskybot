import { readFile, writeFile } from 'node:fs/promises';

function parseArgs(){
  const out={days:7,output:'budsky_7days.json'};
  for(let i=2;i<process.argv.length;i++){
    const a=process.argv[i];
    if(a==='--days') out.days=Number(process.argv[++i]);
    else if(a==='--output') out.output=process.argv[++i];
  }
  if(!Number.isFinite(out.days)||out.days<=0)throw new Error('--days must be > 0');
  if(!out.output)throw new Error('--output is required');
  return out;
}

async function loadEvents(sinceMs){
  const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.SUPABASE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url&&key){
    const params=new URLSearchParams({select:'event,timestamp_ms',timestamp_ms:`gte.${sinceMs}`,order:'timestamp_ms.asc',limit:'10000'});
    const r=await fetch(`${url}/rest/v1/replay_events?${params}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
    if(!r.ok)throw new Error(`SUPABASE_HTTP_${r.status}`);
    return (await r.json()).map(x=>x.event);
  }
  const path=process.env.REPLAY_DATASET_PATH||'datasets/budsky-replay.json';
  const d=JSON.parse(await readFile(path,'utf8'));
  return (d.events||[]).filter(e=>Number(e?.timestamp_ms||0)>=sinceMs);
}

const {days,output}=parseArgs();
const sinceMs=Date.now()-days*24*60*60*1000;
const events=await loadEvents(sinceMs);
const opens=events.filter(e=>e?.event_type==='POSITION_OPEN');
const closes=events.filter(e=>e?.event_type==='POSITION_CLOSE');
const pnlMissing=closes.filter(e=>e?.position?.realized_net_pnl===null||e?.position?.realized_net_pnl===undefined).length;
const payload={exported_at_ms:Date.now(),days,since_ms:sinceMs,event_count:events.length,open_count:opens.length,close_count:closes.length,realized_net_pnl_missing:pnlMissing,events};
await writeFile(output,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify({output,days,event_count:events.length,open_count:opens.length,close_count:closes.length,realized_net_pnl_missing:pnlMissing},null,2));
