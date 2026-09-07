import { Connection, PublicKey } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { authorized } from '../../src/api/auth.js';
import { ReplayLogger } from '../../src/replay/logger.js';
import { makeReplayEvent, realizedOutputSlippageBps } from '../../src/replay/runtime-event.js';

const json = (x: unknown) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v);

export default async function (req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  let c;
  try { c = loadConfig(); } catch { return Response.json({ error: 'config_invalid' }, { status: 503 }); }

  const idem = req.headers.get('x-idempotency-key');
  if (!idem || idem.length < 16 || idem.length > 128) return Response.json({ error: 'valid_x_idempotency_key_required' }, { status: 400 });

  try {
    const store = new SupabaseEventStore(c);
    const replayLogger = new ReplayLogger({ path: c.REPLAY_DATASET_PATH || undefined, sink: store });
    const trade = await store.getTradeByIdempotency(idem);
    if (!trade) return Response.json({ error: 'TRADE_INTENT_NOT_FOUND' }, { status: 404 });
    if (!authorized(req, c, trade.walletPublicKey)) return Response.json({ error: 'wallet_auth_required' }, { status: 401 });
    if (!trade.signature) return Response.json({ error: 'SIGNATURE_REQUIRED_FOR_RECONCILIATION', state: trade.state }, { status: 409 });
    if (trade.state === 'RECONCILED') return new Response(json({ tradeId: trade.tradeId, state: trade.state, signature: trade.signature, reconciled: true }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

    const wallet = new PublicKey(trade.walletPublicKey);
    const conn = new Connection(c.RPC_URL, { commitment: 'confirmed' });
    const status = await conn.getSignatureStatuses([trade.signature], { searchTransactionHistory: true });
    const chainStatus = status.value[0];
    if (!chainStatus) return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: trade.signature, reconciled: false, reason: 'SIGNATURE_NOT_VISIBLE_YET' }), { status: 202, headers: { 'content-type': 'application/json' } });
    if (chainStatus.err) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', error: JSON.stringify(chainStatus.err) });
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: trade.signature, chainError: chainStatus.err }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const parsed = await conn.getParsedTransaction(trade.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!parsed?.meta) return new Response(json({ tradeId: trade.tradeId, state: 'UNKNOWN', signature: trade.signature, reconciled: false, reason: 'TRANSACTION_METADATA_NOT_VISIBLE_YET' }), { status: 202, headers: { 'content-type': 'application/json' } });
    if (parsed.meta.err) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', error: JSON.stringify(parsed.meta.err) });
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: trade.signature, chainError: parsed.meta.err }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const outputMint = trade.intent.outputMint;
    const inputMint = trade.intent.inputMint;
    const inputPre = (parsed.meta.preTokenBalances ?? []).filter(x => x.owner === wallet.toBase58() && x.mint === inputMint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const inputPost = (parsed.meta.postTokenBalances ?? []).filter(x => x.owner === wallet.toBase58() && x.mint === inputMint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const inputDelta = inputPre - inputPost;
    if (inputDelta < trade.intent.inputAmountRaw) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', error: 'INPUT_RECONCILIATION_MISMATCH' });
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: trade.signature, reason: 'INPUT_RECONCILIATION_MISMATCH', expectedInputRaw: trade.intent.inputAmountRaw, observedDebitRaw: inputDelta }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const pre = (parsed.meta.preTokenBalances ?? []).filter(x => x.owner === wallet.toBase58() && x.mint === outputMint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const post = (parsed.meta.postTokenBalances ?? []).filter(x => x.owner === wallet.toBase58() && x.mint === outputMint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const minOutput = trade.quote?.minOutputAmount ?? trade.intent.expectedOutputRaw;
    if (post - pre < minOutput) {
      await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', error: 'OUTPUT_RECONCILIATION_MISMATCH' });
      return new Response(json({ tradeId: trade.tradeId, state: 'CONFIRMATION_FAILED', signature: trade.signature, reason: 'OUTPUT_RECONCILIATION_MISMATCH', expectedMinimumRaw: minOutput, observedDeltaRaw: post - pre }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const actualSlippageBps = realizedOutputSlippageBps(parsed, wallet.toBase58(), outputMint, trade.quote?.outAmount ?? trade.intent.expectedOutputRaw);
    const feeLamports = parsed.meta.fee;
    const feeUsd = feeLamports === 0 ? 0 : null;
    await store.updateTrade(trade.tradeId, { state: 'RECONCILED', error: '', ...(actualSlippageBps !== null ? { executionSlippageBps: actualSlippageBps } : {}), ...(feeUsd !== null ? { feeUsd } : {}) });
    await store.append('trade_reconciled', { tradeId: trade.tradeId, signature: trade.signature, slot: parsed.slot, outputDeltaRaw: post - pre, minimumOutputRaw: minOutput, inputDebitRaw: inputDelta, feeLamports, actualSlippageBps });
    await replayLogger.record(makeReplayEvent({ trade, wallet: wallet.toBase58(), quote: trade.quote ?? null, eventType: 'RECONCILIATION', side: 'BUY', executionLatencyMs: null, success: true, errorCode: null, actualSlippageBps, feeUsd, feeLamports, context: { parsed, confirmationStatus: chainStatus.confirmationStatus ?? null, positionId: trade.tradeId } }));
    return new Response(json({ tradeId: trade.tradeId, state: 'RECONCILED', signature: trade.signature, slot: parsed.slot, outputDeltaRaw: post - pre, minimumOutputRaw: minOutput }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'reconcile_trade_failed' }, { status: 503 });
  }
}
