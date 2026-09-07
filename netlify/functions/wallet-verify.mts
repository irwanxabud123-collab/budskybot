import { PublicKey } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { issueSession, verifyWalletMessage } from '../../src/api/auth.js';
export default async function (req: Request) {
  if (req.method !== 'POST') return Response.json({ error:'method_not_allowed' }, { status:405 });
  let c; try { c=loadConfig(); } catch { return Response.json({ error:'config_invalid' }, { status:503 }); }
  if (!c.API_AUTH_TOKEN) return Response.json({ error:'wallet_auth_not_configured' }, { status:503 });
  try {
    const body=await req.json() as { wallet?:string; message?:string; signature?:string };
    if (!body.wallet || !body.message || !body.signature) return Response.json({ error:'wallet_message_signature_required' }, { status:400 });
    const wallet=new PublicKey(body.wallet).toBase58();
    const now=Date.now();
    if (!body.message.includes('Budsky Bot wallet authentication') || !body.message.includes('Nonce:') || !body.message.includes('Expires:')) return Response.json({ error:'invalid_challenge_message' }, { status:422 });
    const expText=body.message.split('Expires:')[1]?.trim(); const exp=Date.parse(expText ?? '');
    if (!Number.isFinite(exp) || exp < now) return Response.json({ error:'challenge_expired' }, { status:422 });
    if (!verifyWalletMessage(wallet, body.message, body.signature)) return Response.json({ error:'wallet_signature_invalid' }, { status:401 });
    const response=issueSession(req,c,wallet,body.message); if (!response) return Response.json({ error:'challenge_cookie_mismatch' }, { status:401 });
    return response;
  } catch { return Response.json({ error:'wallet_verify_failed' }, { status:400 }); }
}
