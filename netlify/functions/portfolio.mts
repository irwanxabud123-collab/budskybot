const SOL='So11111111111111111111111111111111111111112';
const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
async function rpc(method:string,params:unknown[]){
 const url=process.env.RPC_URL; if(!url) throw new Error('RPC_URL_REQUIRED');
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(7000)});
 if(!r.ok) throw new Error(`RPC_${r.status}`); const j=await r.json(); if(j.error) throw new Error('RPC_ERROR'); return j.result;
}
export default async (req:Request)=>{
 if(req.method!=='GET') return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{'content-type':'application/json'}});
 const wallet=new URL(req.url).searchParams.get('wallet');
 if(!wallet) return new Response(JSON.stringify({error:'WALLET_REQUIRED'}),{status:400,headers:{'content-type':'application/json'}});
 try{
  const [bal,accounts]=await Promise.all([rpc('getBalance',[wallet,{commitment:'confirmed'}]),rpc('getTokenAccountsByOwner',[wallet,{programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'},{encoding:'jsonParsed',commitment:'confirmed'}])]);
  const tokens=(accounts.value||[]).map((x:any)=>{const i=x.account?.data?.parsed?.info;return i?{mint:i.mint,amount:i.tokenAmount?.uiAmountString||'0',decimals:i.tokenAmount?.decimals||0}:null}).filter(Boolean);
  return new Response(JSON.stringify({wallet,solBalance:(bal.value||0)/1e9,tokenAccounts:tokens,updatedAtMs:Date.now(),baseMints:{SOL,USDC}}),{headers:{'content-type':'application/json','cache-control':'no-store'}})
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'PORTFOLIO_FAILED'}),{status:503,headers:{'content-type':'application/json'}})}
};
