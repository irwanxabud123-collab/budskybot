import type {Config} from '../config/config.js';
import type {Signal,MarketSnapshot,RiskApproval,TransactionIntent,TradeRecord,QuoteSummary,RiskState} from '../domain/types.js';
import {JupiterClient} from './jupiter.js';
import type {Signer} from './signer.js';
import {id} from '../core/id.js';
import {SupabaseEventStore} from '../persistence/event-store.js';
import {inspectTransaction} from '../security/transaction-inspector.js';
import {Connection,VersionedTransaction} from '@solana/web3.js';
import {logger} from '../infra/logger.js';
import {ReplayLogger} from '../replay/logger.js';
import {makeReplayEvent,realizedOutputSlippageBps,actualFeeLamports} from '../replay/runtime-event.js';

function isTimeoutError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /timeout|timed out|abort|eai_again|etimedout/i.test(message);
}

function base58Encode(bytes: Uint8Array): string {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!bytes.length) return '';
  const digits=[0];
  for (const byte of bytes) {
    let carry=byte;
    for (let i=0;i<digits.length;i++) {
      const n=digits[i]! * 256 + carry;
      digits[i]=n % 58;
      carry=Math.floor(n/58);
    }
    while(carry){digits.push(carry%58);carry=Math.floor(carry/58);}
  }
  let zeros=0; while(zeros<bytes.length && bytes[zeros]===0) zeros++;
  return '1'.repeat(zeros)+digits.reverse().map(d=>alphabet[d]!).join('');
}

function signatureFromSignedTransaction(base64: string): string | undefined {
  try {
    const signed=VersionedTransaction.deserialize(Buffer.from(base64,'base64'));
    const sig=signed.signatures[0];
    if (!sig || sig.every(x=>x===0)) return undefined;
    return base58Encode(sig);
  } catch { return undefined; }
}

const terminal=new Set(['CONFIRMED','RECONCILED','REJECTED','SIGNING_FAILED','SUBMISSION_FAILED','CONFIRMATION_FAILED','EXPIRED','SIMULATION_FAILED']);
export class ExecutionEngine{
 private readonly replayLogger:ReplayLogger;
 constructor(private readonly c:Config,private readonly j:JupiterClient,private readonly store:SupabaseEventStore,private readonly signer?:Signer,private readonly connection?:Connection,private readonly inspector=inspectTransaction){this.replayLogger=new ReplayLogger({path:c.REPLAY_DATASET_PATH||undefined,sink:store});}
 async execute(signal:Signal,m:MarketSnapshot,r:RiskApproval,idempotencyKey:string,preparedQuote?:{quote:QuoteSummary;transaction:string|null;requestId:string|null},riskState?:RiskState):Promise<TradeRecord>{
  const existing=await this.store.getTradeByIdempotency(idempotencyKey);if(existing){if(terminal.has(existing.state))return existing;throw new Error('UNKNOWN_EXISTING_TRADE_STATE_REQUIRES_RECONCILIATION');}
  const walletPublicKey=this.c.mode==='LIVE'?(this.signer?.publicKey??this.c.WALLET_PUBLIC_KEY):this.c.WALLET_PUBLIC_KEY;
  const tradeId=id('trade'),executionId=id('exec');const intent:TransactionIntent={walletPublicKey,tradeId,signalId:signal.signalId,inputMint:m.inputMint,outputMint:m.outputMint,inputAmountRaw:m.inputAmountRaw,expectedOutputRaw:m.expectedOutputRaw,maxSlippageBps:this.c.MAX_SLIPPAGE_BPS,timestampMs:Date.now(),riskApproved:r.decision==='APPROVE'};
  let trade:TradeRecord={walletPublicKey,tradeId,signalId:signal.signalId,executionId,state:'CREATED',createdAtMs:Date.now(),intent,idempotencyKey,positionId:tradeId,tradeSide:'ENTRY'};trade=await this.store.createOrGetTrade(trade);await this.store.append('trade_created',trade);
  if(r.decision!=='APPROVE'){await this.store.updateTrade(tradeId,{state:'REJECTED',error:r.reason});return {...trade,state:'REJECTED',error:r.reason};}
  const lockKey=`wallet:${walletPublicKey}`;if(!(await this.store.claimLease(lockKey,idempotencyKey,120000))){await this.store.updateTrade(tradeId,{state:'REJECTED',error:'WALLET_EXECUTION_BUSY'});return {...trade,state:'REJECTED',error:'WALLET_EXECUTION_BUSY'};}
  let keepLease=false;let quote:QuoteSummary|null=null;let success:boolean|null=null;let errorCode:string|null=null;let latency:number|null=null;let actualSlip:number|null=null;let feeLamports:number|null=null;let feeUsd:number|null=null;
  try{
    const q=preparedQuote??await this.j.order(m.inputMint,m.outputMint,m.inputAmountRaw,walletPublicKey,this.c.MAX_SLIPPAGE_BPS);quote=q.quote;
    if(Date.now()-q.quote.timestampMs>this.c.MAX_QUOTE_AGE_MS){await this.store.updateTrade(tradeId,{state:'EXPIRED',error:'QUOTE_TOO_OLD',quote:q.quote});return {...trade,state:'EXPIRED',error:'QUOTE_TOO_OLD',quote:q.quote};}
    if(q.quote.priceImpactPct>this.c.MAX_PRICE_IMPACT_PCT){await this.store.updateTrade(tradeId,{state:'REJECTED',error:'PRICE_IMPACT_TOO_HIGH',quote:q.quote});return {...trade,state:'REJECTED',error:'PRICE_IMPACT_TOO_HIGH',quote:q.quote};}
    if(this.c.mode==='PAPER'||this.c.mode==='DRY_RUN'){await this.store.updateTrade(tradeId,{state:'QUOTE_VALIDATED',quote:q.quote});return {...trade,state:'QUOTE_VALIDATED',quote:q.quote};}
    if(!this.signer||!this.connection)throw new Error('SECURE_SIGNER_OR_RPC_MISSING');
    if(!q.transaction||!q.requestId)throw new Error('NO_EXECUTABLE_TRANSACTION');
    const inspection=await this.inspector(this.connection,q.transaction,this.c,m.inputMint,m.outputMint,walletPublicKey,m.inputAmountRaw,q.quote.minOutputAmount);if(!inspection.valid){await this.store.updateTrade(tradeId,{state:'REJECTED',error:inspection.reason,quote:q.quote});return {...trade,state:'REJECTED',error:inspection.reason,quote:q.quote};}
    const tx=VersionedTransaction.deserialize(Buffer.from(q.transaction,'base64'));
    try {
      const sim=await this.connection.simulateTransaction(tx,{sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed'});
      if(sim.value.err){await this.store.updateTrade(tradeId,{state:'SIMULATION_FAILED',error:'SIMULATION_REJECTED',quote:q.quote});return {...trade,state:'SIMULATION_FAILED',error:'SIMULATION_REJECTED',quote:q.quote};}
    } catch (e) {
      errorCode=isTimeoutError(e)?'RPC_TIMEOUT':'SIMULATION_RPC_ERROR';
      await this.store.updateTrade(tradeId,{state:isTimeoutError(e)?'TIMEOUT':'SIMULATION_FAILED',error:errorCode,quote:q.quote});
      throw e;
    }
    await this.store.updateTrade(tradeId,{state:'SIMULATED',quote:q.quote,requestId:q.requestId,transaction:q.transaction});
    let signed:string;
    try { signed=await this.signer.sign(q.transaction); } catch (e) {
      errorCode=isTimeoutError(e)?'SIGNER_TIMEOUT':'SIGNING_FAILED';
      await this.store.updateTrade(tradeId,{state:'SIGNING_FAILED',error:errorCode});
      throw e;
    }
    await this.store.updateTrade(tradeId,{state:'SIGNED',transaction:signed});const started=Date.now();
    let result;try{result=await this.j.execute(signed,q.requestId);}catch(e){latency=Date.now()-started;errorCode='JUPITER_EXECUTE_EXCEPTION';const sig=signatureFromSignedTransaction(signed);await this.store.updateTrade(tradeId,{state:'UNKNOWN',error:e instanceof Error?e.message:errorCode,...(sig?{signature:sig}:{})});keepLease=true;throw new Error('EXECUTION_RESULT_UNKNOWN_RECONCILE_REQUIRED');}
    latency=Date.now()-started;if(result.status!=='Success'||!result.signature){success=false;errorCode=result.error??'JUPITER_EXECUTE_FAILED';await this.store.updateTrade(tradeId,{state:'SUBMISSION_FAILED',error:errorCode});return {...trade,state:'SUBMISSION_FAILED',error:errorCode};}
    const status=await this.connection.getSignatureStatuses([result.signature],{searchTransactionHistory:true});const chain=status.value[0];if(!chain){success=null;errorCode='SIGNATURE_NOT_VISIBLE_YET';await this.store.updateTrade(tradeId,{state:'UNKNOWN',signature:result.signature,error:errorCode});keepLease=true;return {...trade,state:'UNKNOWN',signature:result.signature,error:errorCode};}
    if(chain.err){success=false;errorCode='CHAIN_CONFIRMATION_FAILED';await this.store.updateTrade(tradeId,{state:'CONFIRMATION_FAILED',signature:result.signature,error:JSON.stringify(chain.err)});return {...trade,state:'CONFIRMATION_FAILED',signature:result.signature,error:errorCode};}
    if(chain.confirmationStatus!=='confirmed'&&chain.confirmationStatus!=='finalized'){success=null;errorCode='CHAIN_NOT_CONFIRMED_YET';await this.store.updateTrade(tradeId,{state:'UNKNOWN',signature:result.signature,error:errorCode});keepLease=true;return {...trade,state:'UNKNOWN',signature:result.signature,error:errorCode};}
    const parsed=await this.connection.getParsedTransaction(result.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!parsed?.meta){success=null;errorCode='TRANSACTION_METADATA_NOT_VISIBLE_YET';await this.store.updateTrade(tradeId,{state:'UNKNOWN',signature:result.signature,error:errorCode});keepLease=true;return {...trade,state:'UNKNOWN',signature:result.signature,error:errorCode};}
    if(parsed.meta.err){success=false;errorCode='CHAIN_TRANSACTION_FAILED';await this.store.updateTrade(tradeId,{state:'CONFIRMATION_FAILED',signature:result.signature,error:JSON.stringify(parsed.meta.err)});return {...trade,state:'CONFIRMATION_FAILED',signature:result.signature,error:errorCode};}
    actualSlip=realizedOutputSlippageBps(parsed,walletPublicKey,m.outputMint,q.quote.outAmount);feeLamports=actualFeeLamports(parsed);success=true;await this.store.updateTrade(tradeId,{state:'CONFIRMED',signature:result.signature});return {...trade,state:'CONFIRMED',signature:result.signature};
  }catch(e){if(!String(e instanceof Error?e.message:e).includes('RECONCILE_REQUIRED')){errorCode=errorCode??(e instanceof Error?e.message:'EXECUTION_FAILED');}throw e;
  }finally{
    try{await this.replayLogger.record(makeReplayEvent({trade:{...trade,...(quote?{quote}:{})},wallet:walletPublicKey,quote,eventType:'EXECUTION',side:signal.direction,executionLatencyMs:latency,success,errorCode,actualSlippageBps:actualSlip,feeUsd,feeLamports,context:{market:m,risk:r,...(riskState?{riskState}:{}),strategy:{name:signal.strategyName,version:signal.strategyVersion,modelVersion:signal.modelVersion,calibrationVersion:signal.calibrationVersion,featureVersion:signal.featureVersion,action:signal.direction,signalId:signal.signalId,probability:signal.probability,rawProbability:signal.rawProbability,calibrationStatus:signal.calibrationStatus,calibrationSource:signal.calibrationSource,taScore:signal.taScore,faScore:signal.faScore,marketQualityScore:signal.marketQualityScore,riskScore:signal.riskScore,expectedValue:signal.expectedValue,entry:signal.entryPrice,stopLoss:signal.stopLoss,takeProfit:signal.takeProfit,riskReward:signal.riskReward,sampleSize:signal.sampleSize,dataQuality:signal.dataQuality,regime:signal.regime,bullishReasons:signal.bullishReasons,bearishReasons:signal.bearishReasons,neutralReasons:signal.neutralReasons}}}));}catch(e){logger.warn({err:e,tradeId},'replay_record_failed');}
    if(!keepLease)try{await this.store.releaseLease(lockKey);}catch(e){logger.warn({err:e,lockKey},'execution_lease_release_failed');}
  }
 }
}
