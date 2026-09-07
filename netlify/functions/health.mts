import {loadConfig} from '../../src/config/config.js';
import {Connection} from '@solana/web3.js';
import {LiveControlStore} from '../../src/control/live-control.js';
export default async function(){
 try{
  const c=loadConfig(); const started=Date.now(); let rpcOk=false; let rpcError:string|null=null;
  try{const conn=new Connection(c.RPC_URL,{commitment:'confirmed'});await conn.getLatestBlockhash('confirmed');rpcOk=true;}catch(e){rpcError=e instanceof Error?e.message:'RPC_UNAVAILABLE';}
  const persistenceKey=c.SUPABASE_SECRET_KEY||c.SUPABASE_SERVICE_ROLE_KEY||c.SUPABASE_KEY||'';
  const persistenceConfigured=Boolean(c.SUPABASE_URL&&persistenceKey);
  let persistenceOk=false;let persistenceError:string|null=null;
  if(persistenceConfigured){try{const r=await fetch(`${c.SUPABASE_URL}/rest/v1/replay_events?select=event&limit=1`,{headers:{apikey:persistenceKey,Authorization:`Bearer ${persistenceKey}`},signal:AbortSignal.timeout(5000)});persistenceOk=r.ok;if(!r.ok)persistenceError=`SUPABASE_HTTP_${r.status}`;}catch(e){persistenceError=e instanceof Error?e.message:'SUPABASE_UNAVAILABLE';}}
  let control:any=null;let controlError:string|null=null; if(persistenceConfigured){try{control=await new LiveControlStore(c).get();}catch(e){controlError=e instanceof Error?e.message:'CONTROL_UNAVAILABLE';}}
  const operationalLive=Boolean(control?.mode==='LIVE'&&control?.liveEnabled&&!control?.emergencyStop);
  const safeMode=!operationalLive;
  const ok=rpcOk&&(!c.REQUIRE_SUPABASE||(persistenceConfigured&&persistenceOk));
  return Response.json({ok,mode:control?.mode??c.mode,baseMode:c.mode,liveEnabled:operationalLive,baseLiveEnabled:c.LIVE_ENABLED,emergencyStop:control?.emergencyStop??c.EMERGENCY_STOP,safeMode,control,controlError,persistenceConfigured,persistence:{ok:persistenceOk,error:persistenceError},rpc:{ok:rpcOk,error:rpcError,latencyMs:Date.now()-started},marketDataProvider:'GeckoTerminal',strategyVersion:'budsky-v9.0.0'}, {status:ok?200:503});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:'CONFIG_INVALID'},{status:503});}
}
