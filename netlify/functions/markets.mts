import { scoreOpportunity, type ScanToken } from '../../src/engine/opportunity.js';

const BASE='https://api.jup.ag';
const cache = new Map<string,{at:number,data:unknown}>();
const TTL=20_000;

async function jup(path:string){
  const key=process.env.JUPITER_API_KEY||'';
  if(!key) throw new Error('JUPITER_API_KEY is required for real-time market scanning');
  const r=await fetch(`${BASE}${path}`,{headers:{'x-api-key':key},signal:AbortSignal.timeout(7000)});
  if(!r.ok) throw new Error(`JUPITER_${r.status}`);
  return r.json();
}

async function scan(){
  const now=Date.now(); const cached=cache.get('scan');
  if(cached && now-cached.at<TTL) return cached.data;
  const [trending,traded,organic]=await Promise.all([
    jup('/tokens/v2/toptrending/1h?limit=50'),
    jup('/tokens/v2/toptraded/1h?limit=50'),
    jup('/tokens/v2/toporganicscore/1h?limit=50')
  ]);
  const map=new Map<string,ScanToken>();
  for(const row of [...trending,...traded,...organic]) if(row?.id && !map.has(row.id)) map.set(row.id,row);
  const opportunities=[...map.values()].map(t=>scoreOpportunity(t,now)).sort((a,b)=>b.opportunityScore-a.opportunityScore);
  const data={updatedAtMs:now,source:'Jupiter Tokens API V2',universeSize:opportunities.length,opportunities};
  cache.set('scan',{at:now,data}); return data;
}

export default async (req:Request)=>{
  if(req.method!=='GET') return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{'content-type':'application/json'}});
  try{return new Response(JSON.stringify(await scan()),{headers:{'content-type':'application/json','cache-control':'no-store'}})}
  catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'MARKET_SCAN_FAILED'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}})}
};
