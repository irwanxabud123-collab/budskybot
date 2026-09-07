import { loadConfig } from '../../src/config/config.js';
import { LiveControlStore } from '../../src/control/live-control.js';
import { PublicKey } from '@solana/web3.js';
import { walletSessionAuthorized } from '../../src/api/auth.js';

const SAFE = (c:any, error?:string) => ({
  mode:'PAPER', liveEnabled:false, emergencyStop:Boolean(c.EMERGENCY_STOP),
  updatedAtMs:0, updatedBy:null, version:0, ...(error?{error}: {})
});

export default async function(req:Request){
  if(req.method!=='GET'&&req.method!=='POST') return Response.json({error:'method_not_allowed'},{status:405});
  let c;
  try { c=loadConfig(); }
  catch(e) { return Response.json({error:'config_invalid',detail:e instanceof Error?e.message:'unknown'},{status:503}); }

  // Read-only status must remain available even if the durable control row is temporarily unavailable.
  if(req.method==='GET'){
    try {
      const store=new LiveControlStore(c);
      const state=await store.get();
      return Response.json({ok:true,baseMode:c.MODE,baseLiveEnabled:c.LIVE_ENABLED,control:state,persistenceOk:true},{headers:{'cache-control':'no-store'}});
    } catch(e) {
      const detail=e instanceof Error?e.message:'CONTROL_READ_FAILED';
      return Response.json({ok:true,baseMode:c.MODE,baseLiveEnabled:c.LIVE_ENABLED,control:SAFE(c,detail),persistenceOk:false,controlError:detail},{headers:{'cache-control':'no-store'}});
    }
  }

  if(!c.API_AUTH_TOKEN) return Response.json({error:'control_plane_requires_api_auth_token'},{status:503});
  try {
    const body=await req.json() as {action?:string;wallet?:string};
    const allowed=['ACTIVATE_LIVE','DEACTIVATE_LIVE','EMERGENCY_STOP','CLEAR_EMERGENCY_STOP','SET_PAPER'];
    if(!body.action||!allowed.includes(body.action)) return Response.json({error:'invalid_control_action'},{status:400});
    const walletAction = body.action==='ACTIVATE_LIVE'||body.action==='EMERGENCY_STOP'||body.action==='CLEAR_EMERGENCY_STOP';
    let actor='ui-operator';
    if(walletAction){
      if(!body.wallet) return Response.json({error:'wallet_required'},{status:400});
      const wallet=new PublicKey(body.wallet).toBase58();
      if(!walletSessionAuthorized(req,c,wallet)) return Response.json({error:'wallet_auth_required'},{status:401});
      actor=wallet;
    } else if(body.wallet){
      actor=new PublicKey(body.wallet).toBase58();
    }
    if(body.action==='ACTIVATE_LIVE'){
      if(c.MODE!=='LIVE') return Response.json({error:'deployment_not_live_capable',detail:'Deployment base MODE is not LIVE. PAPER remains locked safely.'},{status:409});
      if(!c.LIVE_ENABLED) return Response.json({error:'deployment_live_gate_locked',detail:'LIVE_ENABLED is false at deployment level.'},{status:409});
      if(c.EMERGENCY_STOP) return Response.json({error:'deployment_emergency_stop_active'},{status:409});
    }
    const store=new LiveControlStore(c);
    const state=await store.mutate(body.action as any,actor);
    return Response.json({ok:true,control:state},{headers:{'cache-control':'no-store'}});
  } catch(e) {
    return Response.json({error:e instanceof Error?e.message:'CONTROL_FAILED'},{status:503,headers:{'cache-control':'no-store'}});
  }
}
