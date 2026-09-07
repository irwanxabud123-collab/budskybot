import type {Config} from '../config/config.js'; import type {QuoteSummary} from '../domain/types.js'; import {fetchJson} from '../infra/http.js';
interface OrderResponse {requestId?:string;transaction?:string|null;inputMint:string;outputMint:string;inAmount:string;outAmount:string;otherAmountThreshold?:string;slippageBps?:number;priceImpact?:number|string;priceImpactPct?:string;routePlan?:unknown[];router?:string;gasless?:boolean;}
interface ExecuteResponse {status:'Success'|'Failed';signature?:string;error?:string;code?:number;totalInputAmount?:string;totalOutputAmount?:string;inputAmountResult?:string;outputAmountResult?:string;}
export class JupiterClient{
 constructor(private readonly c:Config){}
 private headers(){return this.c.JUPITER_API_KEY?{'x-api-key':this.c.JUPITER_API_KEY}:{};}
 async order(inputMint:string,outputMint:string,amount:bigint,taker:string,slippageBps:number){
  const u=new URL(`${this.c.JUPITER_BASE_URL}/order`);u.searchParams.set('inputMint',inputMint);u.searchParams.set('outputMint',outputMint);u.searchParams.set('amount',amount.toString());if(taker)u.searchParams.set('taker',taker);u.searchParams.set('slippageBps',String(slippageBps));
  const raw=await fetchJson<OrderResponse>(u.toString(),{headers:this.headers()},8000,2);
  if(raw.inputMint!==inputMint||raw.outputMint!==outputMint||raw.inAmount!==amount.toString())throw new Error('JUPITER_QUOTE_MISMATCH');
  const out=BigInt(raw.outAmount),min=BigInt(raw.otherAmountThreshold??raw.outAmount);const impact=Number(raw.priceImpactPct??raw.priceImpact??NaN);
  if(!Number.isFinite(impact)||out<=0n||min<=0n||min>out)throw new Error('JUPITER_QUOTE_INVALID');
  const quote:QuoteSummary={...(raw.requestId?{requestId:raw.requestId}:{}),inputMint,outputMint,inAmount:BigInt(raw.inAmount),outAmount:out,minOutputAmount:min,slippageBps:raw.slippageBps??slippageBps,priceImpactPct:impact,timestampMs:Date.now(),raw};
  return {quote,transaction:raw.transaction??null,requestId:raw.requestId??null,raw};
 }
 async execute(signedTransactionBase64:string,requestId:string){return fetchJson<ExecuteResponse>(`${this.c.JUPITER_BASE_URL}/execute`,{method:'POST',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({signedTransaction:signedTransactionBase64,requestId})},15000,0);}
}
