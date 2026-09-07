import { Connection, PublicKey } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { JupiterClient } from '../../src/execution/jupiter.js';
import { ReplayLogger } from '../../src/replay/logger.js';
import { recordPositionUpdate } from '../../src/replay/position-lifecycle.js';
import { authorized } from '../../src/api/auth.js';

export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
 let c;try{c=loadConfig();}catch(e){return Response.json({error:'config_invalid'},{status:503});}
 try{
  const body=await req.json() as {wallet?:string;positionId?:string};if(!body.wallet||!body.positionId)return Response.json({error:'wallet_positionId_required'},{status:400});
  const wallet=new PublicKey(body.wallet).toBase58();if(!authorized(req,c,wallet))return Response.json({error:'wallet_auth_required'},{status:401});
  const store=new SupabaseEventStore(c),entry=await store.getTradeById(body.positionId);if(!entry)return Response.json({error:'POSITION_NOT_FOUND'},{status:404});
  if(entry.walletPublicKey!==wallet||entry.positionId!==body.positionId)return Response.json({error:'POSITION_WALLET_MISMATCH'},{status:422});
  if(entry.tradeSide!=='ENTRY'||!['CONFIRMED','RECONCILED'].includes(entry.state))return Response.json({error:'POSITION_NOT_OPEN',state:entry.state},{status:409});
  const quote=await new JupiterClient(c).order(entry.intent.outputMint,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',entry.positionQuantityRaw??entry.intent.expectedOutputRaw,wallet,c.MAX_SLIPPAGE_BPS);
  const entryValue=Number(entry.intent.inputAmountRaw)/1e6;const exitValue=Number(quote.quote.outAmount)/1e6;const unrealized=exitValue-entryValue-(entry.feeUsd??0);
  const logger=new ReplayLogger({path:c.REPLAY_DATASET_PATH||undefined,sink:store});
  await recordPositionUpdate({trade:entry,wallet,quote:quote.quote,logger,unrealizedPnlUsd:unrealized});
  return Response.json({positionId:body.positionId,timestamp_ms:Date.now(),unrealized_pnl_usd:unrealized,quote:quote.quote});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'position_update_failed'},{status:500});}
}
