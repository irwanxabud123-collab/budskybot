import { loadConfig } from '../../src/config/config.js';
import { LiveControlStore } from '../../src/control/live-control.js';
import { PublicKey } from '@solana/web3.js';
import { walletSessionAuthorized } from '../../src/api/auth.js';
export default async function(req:Request){
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  let c;try{c=loadConfig();}catch(e){return Response.json({error:'config_invalid',detail:e instanceof Error?e.message:'unknown'},{status:503});}
  if(!c.API_AUTH_TOKEN)return Response.json({error:'control_plane_requires_api_auth_token'},{status:503});
  try{const store=new LiveControlStore(c);if(req.method==='GET'){const state=await store.get();return Response.json({ok:true,baseMode:c.MODE,baseLiveEnabled:c.LIVE_ENABLED,control:state},{headers:{'cache-control':'no-store'}});}
    const body=await req.json() as {action?:string;wallet?:string}; if(!body.action||!['ACTIVATE_LIVE','DEACTIVATE_LIVE','EMERGENCY_STOP','CLEAR_EMERGENCY_STOP','SET_PAPER'].includes(body.action))return Response.json({error:'invalid_control_action'},{status:400});
    if(!body.wallet)return Response.json({error:'wallet_required'},{status:400}); const wallet=new PublicKey(body.wallet).toBase58(); if(!walletSessionAuthorized(req,c,wallet))return Response.json({error:'wallet_auth_required'},{status:401});
    if(body.action==='ACTIVATE_LIVE'){if(c.MODE!=='LIVE')return Response.json({error:'deployment_not_live_capable',detail:'Set the deployment base MODE to LIVE once, then use this control plane for daily PAPER/LIVE switching.'},{status:409});if(!c.LIVE_ENABLED)return Response.json({error:'deployment_live_gate_locked',detail:'LIVE_ENABLED is still false at deployment level; activation cannot bypass the master deployment safety gate.'},{status:409});if(c.EMERGENCY_STOP)return Response.json({error:'deployment_emergency_stop_active'},{status:409});}
    const state=await store.mutate(body.action as any,wallet);return Response.json({ok:true,control:state},{headers:{'cache-control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'CONTROL_FAILED'},{status:503});}
}
