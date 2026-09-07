import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { loadConfig } from '../../src/config/config.js';
import { LiveControlStore } from '../../src/control/live-control.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { JupiterClient } from '../../src/execution/jupiter.js';
import { inspectTransaction } from '../../src/security/transaction-inspector.js';
import { authorized, base58Encode } from '../../src/api/auth.js';
import { ReplayLogger } from '../../src/replay/logger.js';
import { makeReplayEvent, realizedOutputSlippageBps } from '../../src/replay/runtime-event.js';
import { buildPositionOpenEvent, buildPositionCloseEvent, positionQuantityFromParsed } from '../../src/replay/position-lifecycle.js';
const json = (x: unknown) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v);

async function solFeeUsd(c: ReturnType<typeof loadConfig>, lamports:number):Promise<number|null>{
  if(!c.JUPITER_API_KEY || lamports<=0)return lamports===0?0:null;
  try { const r=await fetch('https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112',{headers:{'x-api-key':c.JUPITER_API_KEY},signal:AbortSignal.timeout(5000)}); if(!r.ok)return null; const data=await r.json() as Record<string,{usdPrice?:number}>; const p=Number(data['So11111111111111111111111111111111111111112']?.usdPrice); return Number.isFinite(p)&&p>0?(lamports/1e9)*p:null; } catch { return null; }
}

export default async function (req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  let c;
  try { c = loadConfig(); } catch (e) { return Response.json({ error: 'config_invalid', detail: e instanceof Error ? e.message : 'unknown' }, { status: 503 }); }
  if (c.MODE !== 'LIVE' || !c.LIVE_ENABLED || c.EMERGENCY_STOP || !c.LIVE_BROWSER_EXECUTION_ENABLED || c.WALLET_SIGNING_MODE !== 'BROWSER') return Response.json({ error: 'live_browser_execution_not_enabled' }, { status: 409 });
  const control = await new LiveControlStore(c).get().catch(() => null);
  if (!control || control.mode !== 'LIVE' || !control.liveEnabled || control.emergencyStop) return Response.json({ error: 'live_control_plane_locked', control }, { status: 409 });
  const idem = req.headers.get('x-idempotency-key');
  if (!idem || idem.length < 16 || idem.length > 128) return Response.json({ error: 'valid_x_idempotency_key_required' }, { status: 400 });

  try {
    const body = await req.json() as { signedTransaction?: string; requestId?: string; wallet?: string };
    if (!body.signedTransaction || !body.requestId || !body.wallet) return Response.json({ error: 'signedTransaction_requestId_wallet_required' }, { status: 400 });
    const wallet = new PublicKey(body.wallet).toBase58();
    if (!authorized(req, c, wallet)) return Response.json({ error: 'wallet_auth_required' }, { status: 401 });
    const store = new SupabaseEventStore(c);
    const trade = await store.getTradeByIdempotency(idem);
    if (!trade) return Response.json({ error: 'TRADE_INTENT_NOT_FOUND' }, { status: 404 });
    if (trade.walletPublicKey !== wallet || trade.intent.walletPublicKey !== wallet) return Response.json({ error: 'WALLET_INTENT_MISMATCH' }, { status: 422 });
    if (trade.state === 'CONFIRMED' || trade.state === 'RECONCILED') return new Response(json({ tradeId: trade.tradeId, state: trade.state, signature: trade.signature }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (trade.state !== 'TRANSACTION_BUILT' && trade.state !== 'SIGNED') return Response.json({ error: 'TRADE_STATE_NOT_EXECUTABLE', state: trade.state }, { status: 409 });
    if (trade.requestId !== body.requestId) return Response.json({ error: 'REQUEST_ID_MISMATCH' }, { status: 422 });

    const lockKey = `wallet:${wallet}`;
    if (!(await store.claimLease(lockKey, idem, 120000))) return Response.json({ error: 'WALLET_EXECUTION_BUSY' }, { status: 409 });
    const tx = VersionedTransaction.deserialize(Buffer.from(body.signedTransaction, 'base64'));
    if (!trade.transaction) {
      await store.releaseLease(lockKey);
      return Response.json({ error: 'PREPARED_TRANSACTION_NOT_PERSISTED' }, { status: 409 });
    }
    const preparedTx = VersionedTransaction.deserialize(Buffer.from(trade.transaction, 'base64'));
    if (!Buffer.from(tx.message.serialize()).equals(Buffer.from(preparedTx.message.serialize()))) {
      await store.releaseLease(lockKey);
      return Response.json({ error: 'SIGNED_TRANSACTION_MESSAGE_MISMATCH' }, { status: 422 });
    }
    const staticKeys = tx.message.staticAccountKeys.map(x => x.toBase58());
    const walletIndex = staticKeys.indexOf(wallet);
    const requiredSigners = tx.message.header.numRequiredSignatures;
    if (walletIndex < 0 || walletIndex >= requiredSigners) { await store.releaseLease(lockKey); return Response.json({ error: 'WALLET_NOT_REQUIRED_TRANSACTION_SIGNER' }, { status: 422 }); }
    if (!tx.signatures[walletIndex] || tx.signatures[walletIndex].every(byte => byte === 0)) { await store.releaseLease(lockKey); return Response.json({ error: 'WALLET_SIGNATURE_MISSING' }, { status: 422 }); }
    if (!tx.signatures.some(s => s.some(byte => byte !== 0))) { await store.releaseLease(lockKey); return Response.json({ error: 'TRANSACTION_NOT_SIGNED' }, { status: 422 }); }
    // The message is already bound to the persisted intent; also require every present signature to be cryptographically valid.
    const messageBytes = tx.message.serialize();
    for (let i = 0; i < requiredSigners; i++) {
      const signature = tx.signatures[i];
      const signer = tx.message.staticAccountKeys[i];
      if (!signature || !signer || signature.every(byte => byte === 0)) continue;
      if (!nacl.sign.detached.verify(messageBytes, signature, signer.toBytes())) {
        await store.releaseLease(lockKey);
        return Response.json({ error: 'TRANSACTION_SIGNATURE_INVALID' }, { status: 422 });
      }
    }

    const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
    const inspection = await inspectTransaction(conn, body.signedTransaction, c, trade.intent.inputMint, trade.intent.outputMint, wallet, trade.intent.inputAmountRaw, trade.quote?.minOutputAmount ?? trade.intent.expectedOutputRaw);
    if (!inspection.valid) {
      await store.updateTrade(trade.tradeId, { state: 'REJECTED', error: inspection.reason });
      await store.releaseLease(lockKey);
      return Response.json({ error: 'SIGNED_TRANSACTION_INTENT_REJECTED', inspection }, { status: 422 });
    }

    await store.updateTrade(trade.tradeId, { state: 'SIGNED' });
    const executeStartedAt = Date.now();
    let result;
    try {
      result = await new JupiterClient(c).execute(body.signedTransaction, body.requestId);
    } catch (e) {
      // Jupiter/network failure after signing is ambiguous: the transaction may already have landed.
      // Preserve the signed transaction signature and force reconciliation; never blindly retry.
      const possibleSignature = tx.signatures[0] && !tx.signatures[0].every(byte => byte === 0)
        ? base58Encode(tx.signatures[0])
        : undefined;
      await store.updateTrade(trade.tradeId, {
        state: 'UNKNOWN',
        ...(possibleSignature ? { signature: possibleSignature } : {}),
        error: e instanceof Error ? e.message : 'JUPITER_EXECUTE_UNCERTAIN',
      });
      await store.append('browser_trade_unknown', { tradeId: trade.tradeId, signature: possibleSignature ?? null, reason: 'JUPITER_EXECUTE_EXCEPTION' });
      const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
      await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs:Date.now()-executeStartedAt,success:null,errorCode:'JUPITER_EXECUTE_EXCEPTION',actualSlippageBps:null,feeUsd:null}));
      return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: possibleSignature, message: 'Execution result is ambiguous; no retry was performed. Reconcile the transaction before any further action.' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (result.status !== 'Success' || !result.signature) {
      await store.updateTrade(trade.tradeId, { state: 'SUBMISSION_FAILED', error: result.error || 'JUPITER_EXECUTE_FAILED' });
      await store.releaseLease(lockKey);
      const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
      await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs:Date.now()-executeStartedAt,success:false,errorCode:result.error || 'JUPITER_EXECUTE_FAILED',actualSlippageBps:null,feeUsd:null}));
      return new Response(json({ tradeId: trade.tradeId, state: 'SUBMISSION_FAILED', result }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    // Do not call it CONFIRMED just because Jupiter returned a success response.
    const executionLatencyMs = Date.now() - executeStartedAt;
    const status = await conn.getSignatureStatuses([result.signature], { searchTransactionHistory: true });
    const chain = status.value[0];
    if (!chain) {
      await store.updateTrade(trade.tradeId, { state: 'UNKNOWN', signature: result.signature, error: 'SIGNATURE_NOT_VISIBLE_YET' });
      await store.append('browser_trade_unknown', { tradeId: trade.tradeId, signature: result.signature });
      const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
      await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs,success:null,errorCode:'SIGNATURE_NOT_VISIBLE_YET',actualSlippageBps:null,feeUsd:null}));
      return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: result.signature, message: 'Transaction was submitted but chain confirmation is not yet observable; no retry was performed.' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (chain.err) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', signature: result.signature, error: JSON.stringify(chain.err) });
      await store.releaseLease(lockKey);
      const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
      await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs,success:false,errorCode:'CHAIN_CONFIRMATION_FAILED',actualSlippageBps:null,feeUsd:null}));
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: result.signature, chainError: chain.err }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    if (chain.confirmationStatus !== 'confirmed' && chain.confirmationStatus !== 'finalized') {
      await store.updateTrade(trade.tradeId, { state: 'UNKNOWN', signature: result.signature, error: 'CHAIN_NOT_CONFIRMED_YET' });
      await store.append('browser_trade_unknown', { tradeId: trade.tradeId, signature: result.signature, confirmationStatus: chain.confirmationStatus ?? null });
      const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
      await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs,success:null,errorCode:'CHAIN_NOT_CONFIRMED_YET',actualSlippageBps:null,feeUsd:null}));
      return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: result.signature, message: 'Transaction is not yet confirmed; reconcile before retrying.' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    const parsed = await conn.getParsedTransaction(result.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!parsed?.meta) {
      await store.updateTrade(trade.tradeId, { state: 'UNKNOWN', signature: result.signature, error: 'TRANSACTION_METADATA_NOT_VISIBLE_YET' });
      await store.append('browser_trade_unknown', { tradeId: trade.tradeId, signature: result.signature, reason: 'TRANSACTION_METADATA_NOT_VISIBLE_YET' });
      return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: result.signature, message: 'Chain metadata is not safely reconciled yet; no retry was performed.' }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (parsed.meta.err) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', signature: result.signature, error: JSON.stringify(parsed.meta.err) });
      await store.releaseLease(lockKey);
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: result.signature, chainError: parsed.meta.err }), { status: 502, headers: { 'content-type': 'application/json' } });
    }
    const actualSlippageBps = realizedOutputSlippageBps(parsed, wallet, trade.intent.outputMint, trade.quote?.outAmount ?? trade.intent.expectedOutputRaw);
    const feeLamports = parsed?.meta?.fee ?? null;
    const feeUsd = feeLamports === null ? null : await solFeeUsd(c, feeLamports);
    const positionQuantityRaw = trade.tradeSide === 'ENTRY' && parsed ? positionQuantityFromParsed(parsed, wallet, trade.intent.outputMint) : null;
    await store.updateTrade(trade.tradeId, { state: 'CONFIRMED', signature: result.signature, ...(feeUsd !== null ? { feeUsd } : {}), ...(actualSlippageBps !== null ? { executionSlippageBps: actualSlippageBps } : {}), ...(positionQuantityRaw !== null ? { positionQuantityRaw } : {}), ...(trade.intent.inputMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? {notionalUsd:Number(trade.intent.inputAmountRaw)/1e6} : trade.notionalUsd!==undefined ? {notionalUsd:trade.notionalUsd} : {}) });
    if (parsed && trade.tradeSide === 'ENTRY') {
      const openEvent = buildPositionOpenEvent({ ...trade, signature: result.signature, ...(trade.quote?{quote:trade.quote}: {}) }, wallet, parsed, new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store }));
      if (openEvent) await new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store }).record(openEvent);
    } else if (parsed && trade.tradeSide === 'EXIT' && trade.positionId) {
      const entry = await store.getTradeById(trade.positionId);
      if (entry?.signature) {
        const entryParsed = await conn.getParsedTransaction(entry.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (entryParsed) {
          const closeEvent = buildPositionCloseEvent({ entry, exit: { ...trade, signature: result.signature, ...(trade.quote?{quote:trade.quote}: {}) }, wallet, entryParsed, exitParsed: parsed, logger: new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store }), entryFeeUsd: entry.feeUsd ?? null, exitFeeUsd: feeUsd });
          if (closeEvent) {
            await new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store }).record(closeEvent);
            const pnlPatch = closeEvent.pnl.net_pnl_usd === null ? {} : { realizedPnlUsd: closeEvent.pnl.net_pnl_usd };
            const feePatch = closeEvent.execution.fee_usd === null ? {} : { feeUsd: closeEvent.execution.fee_usd };
            // Realized P&L belongs to the closing trade only. The entry trade is a
            // cost-basis record; copying realized P&L onto it would cause risk
            // aggregation to count the same closed position twice.
            await store.updateTrade(trade.tradeId, { ...pnlPatch, ...feePatch });
          } else {
            await store.append('position_close_missing_onchain_fields', { tradeId: trade.tradeId, positionId: trade.positionId, signature: result.signature });
          }
        }
      }
    }
    await store.releaseLease(lockKey);
    await store.append('browser_trade_confirmed', { tradeId: trade.tradeId, signature: result.signature, confirmationStatus: chain.confirmationStatus ?? null, actualSlippageBps });
    const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
    await replayLogger.record(makeReplayEvent({trade,wallet,quote:trade.quote??null,executionLatencyMs,success:true,errorCode:null,actualSlippageBps,feeUsd,feeLamports,context:{parsed,confirmationStatus:chain.confirmationStatus??null}}));
    return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMED', result, chain: { confirmationStatus: chain.confirmationStatus ?? null, slot: chain.slot } }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'execute_trade_failed' }, { status: 500 });
  }
}
