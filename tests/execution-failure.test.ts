import { describe, it, expect, vi } from 'vitest';
import { Keypair, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { ExecutionEngine } from '../src/execution/execution-engine.js';
import { reconcileUnknownTrade } from '../src/execution/reconciliation-worker.js';
import type { TradeRecord } from '../src/domain/types.js';

function base58Encode(bytes: Uint8Array): string {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits=[0];
  for(const byte of bytes){let carry=byte;for(let i=0;i<digits.length;i++){const n=digits[i]! * 256 + carry;digits[i]=n%58;carry=Math.floor(n/58);}while(carry){digits.push(carry%58);carry=Math.floor(carry/58);}}
  let zeros=0;while(zeros<bytes.length&&bytes[zeros]===0)zeros++;
  return '1'.repeat(zeros)+digits.reverse().map(d=>alphabet[d]!).join('');
}

function makeSignedTransaction(): string {
  const wallet = Keypair.generate();
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [],
  }).compileToV0Message());
  tx.sign([wallet]);
  return Buffer.from(tx.serialize()).toString('base64');
}

function makeQuote(transaction: string) {
  return {
    quote: {
      inputMint: 'A'.repeat(32), outputMint: 'B'.repeat(32), inAmount: 100n, outAmount: 90n,
      minOutputAmount: 80n, slippageBps: 50, priceImpactPct: 0.1, timestampMs: Date.now(), raw: {},
    },
    transaction, requestId: 'req-1',
  };
}

function makeHarness(opts: {
  simulate?: () => Promise<{ value: { err: unknown | null } }>;
  execute?: () => Promise<{ status: 'Success' | 'Failed'; signature?: string; error?: string }>;
  statuses?: () => Promise<{ value: any[] }>;
  parsed?: () => Promise<any>;
} = {}) {
  const signed = makeSignedTransaction();
  const baseTrade: TradeRecord = {
    walletPublicKey: '', tradeId: 'trade-1', signalId: 'signal-1', executionId: 'exec-1', state: 'CREATED',
    createdAtMs: Date.now(), idempotencyKey: 'idem-1234567890',
    positionId: 'trade-1', tradeSide: 'ENTRY',
    intent: { walletPublicKey: '', tradeId: 'trade-1', signalId: 'signal-1', inputMint: 'A'.repeat(32), outputMint: 'B'.repeat(32), inputAmountRaw: 100n, expectedOutputRaw: 90n, maxSlippageBps: 50, timestampMs: Date.now(), riskApproved: true },
  };
  const updates: Array<Partial<TradeRecord>> = [];
  const store: any = {
    getTradeByIdempotency: vi.fn().mockResolvedValue(null),
    createOrGetTrade: vi.fn().mockResolvedValue(baseTrade),
    append: vi.fn().mockResolvedValue(undefined),
    appendReplayEvent: vi.fn().mockResolvedValue(undefined),
    claimLease: vi.fn().mockResolvedValue(true),
    releaseLease: vi.fn().mockResolvedValue(undefined),
    updateTrade: vi.fn(async (_id: string, patch: Partial<TradeRecord>) => { updates.push(patch); Object.assign(baseTrade, patch); }),
  };
  const connection: any = {
    simulateTransaction: vi.fn(opts.simulate ?? (async () => ({ value: { err: null } }))),
    getSignatureStatuses: vi.fn(opts.statuses ?? (async () => ({ value: [{ confirmationStatus: 'confirmed', err: null }] }))),
    getParsedTransaction: vi.fn(opts.parsed ?? (async () => ({ slot: 1, meta: { err: null, fee: 5000, preTokenBalances: [], postTokenBalances: [] } }))),
  };
  const jupiter: any = {
    order: vi.fn(async () => makeQuote(signed)),
    execute: vi.fn(opts.execute ?? (async () => ({ status: 'Success', signature: '5'.repeat(88) }))),
  };
  const signer: any = { publicKey: baseTrade.walletPublicKey, sign: vi.fn(async () => signed) };
  const config: any = {
    mode: 'LIVE', MODE: 'LIVE', WALLET_PUBLIC_KEY: '', MAX_SLIPPAGE_BPS: 50, MAX_QUOTE_AGE_MS: 5000,
    MAX_PRICE_IMPACT_PCT: 1, REPLAY_DATASET_PATH: '', REQUIRE_TRANSACTION_INTENT_ALLOWLIST: false,
    MAX_TRANSACTION_BYTES: 256000, MAX_TRANSACTION_INSTRUCTIONS: 24,
  };
  const signal: any = { signalId: 'signal-1', strategyName: 'test', strategyVersion: '1', modelVersion: '1', calibrationVersion: '1', featureVersion: '1', direction: 'BUY', probability: 0.8, rawProbability: 0.8, calibrationStatus: 'CALIBRATED', calibrationSource: 'LIVE_REPLAY', taScore: 80, faScore: null, marketQualityScore: 80, riskScore: 80, expectedValue: 1, entryPrice: 1, stopLoss: 0.9, takeProfit: 1.2, riskReward: 2, sampleSize: 100, dataQuality: 'COMPLETE', regime: 'NORMAL', bullishReasons: [], bearishReasons: [], neutralReasons: [], disclaimer: 'test' };
  const market: any = { inputMint: 'A'.repeat(32), outputMint: 'B'.repeat(32), inputAmountRaw: 100n, expectedOutputRaw: 90n, timestampMs: Date.now(), source: 'test', freshnessMs: 0, valid: true, priceImpactPct: 0.1, estimatedLiquidityUsd: 100000 };
  const risk: any = { decision: 'APPROVE', reason: 'test' };
  const engine = new ExecutionEngine(config, jupiter, store, signer, connection, async () => ({ valid: true, reason: 'test', programIds: [], accountKeys: [] }));
  return { engine, store, connection, jupiter, signer, signal, market, risk, quote: makeQuote(signed), signedTxForTest: signed, updates, baseTrade };
}

describe('ExecutionEngine failure injection', () => {
  it('marks a pre-broadcast RPC timeout as TIMEOUT', async () => {
    const h = makeHarness({ simulate: async () => { throw new Error('RPC timeout'); } });
    await expect(h.engine.execute(h.signal, h.market, h.risk, 'idem-timeout-123456')).rejects.toThrow('RPC timeout');
    expect(h.updates.some(x => x.state === 'TIMEOUT' && x.error === 'RPC_TIMEOUT')).toBe(true);
    expect(h.signer.sign).not.toHaveBeenCalled();
    expect(h.jupiter.execute).not.toHaveBeenCalled();
  });

  it('persists UNKNOWN plus the signed transaction signature when Jupiter /execute throws', async () => {
    const h = makeHarness({ execute: async () => { throw new Error('Jupiter /execute unavailable'); } });
    await expect(h.engine.execute(h.signal, h.market, h.risk, 'idem-jup-error-123456')).rejects.toThrow('EXECUTION_RESULT_UNKNOWN_RECONCILE_REQUIRED');
    const unknown = h.updates.find(x => x.state === 'UNKNOWN');
    expect(unknown?.error).toContain('Jupiter /execute unavailable');
    expect(typeof unknown?.signature).toBe('string');
    const signed = VersionedTransaction.deserialize(Buffer.from(h.signedTxForTest, 'base64'));
    expect(unknown?.signature).toBe(base58Encode(signed.signatures[0]!));
    expect(h.updates.some(x => x.state === 'SIGNED')).toBe(true);
    expect(h.store.releaseLease).not.toHaveBeenCalled();
  });

  it('keeps a successful Jupiter submission UNKNOWN when the signature is not visible', async () => {
    const h = makeHarness({ statuses: async () => ({ value: [null] }) });
    const trade = await h.engine.execute(h.signal, h.market, h.risk, 'idem-no-signature-123456', h.quote);
    expect(trade.state).toBe('UNKNOWN');
    expect(trade.error).toBe('SIGNATURE_NOT_VISIBLE_YET');
    expect(h.updates.some(x => x.state === 'UNKNOWN' && x.error === 'SIGNATURE_NOT_VISIBLE_YET')).toBe(true);
    expect(h.store.releaseLease).not.toHaveBeenCalled();
  });

  it('keeps a processed-but-not-confirmed signature UNKNOWN instead of treating it as success', async () => {
    const h = makeHarness({ statuses: async () => ({ value: [{ confirmationStatus: 'processed', err: null }] }) });
    const trade = await h.engine.execute(h.signal, h.market, h.risk, 'idem-confirmation-stuck-123456', h.quote);
    expect(trade.state).toBe('UNKNOWN');
    expect(trade.error).toBe('CHAIN_NOT_CONFIRMED_YET');
    expect(h.updates.some(x => x.state === 'UNKNOWN' && x.error === 'CHAIN_NOT_CONFIRMED_YET')).toBe(true);
  });
});

describe('UNKNOWN reconciliation worker', () => {
  const unknownTrade = (): TradeRecord => ({
    walletPublicKey: 'wallet', tradeId: 'trade-unknown', signalId: 'signal', executionId: 'exec', state: 'UNKNOWN', createdAtMs: Date.now(),
    signature: '5'.repeat(88), idempotencyKey: 'idem', positionId: 'trade-unknown', tradeSide: 'ENTRY',
    intent: { walletPublicKey: 'wallet', tradeId: 'trade-unknown', signalId: 'signal', inputMint: 'A'.repeat(32), outputMint: 'B'.repeat(32), inputAmountRaw: 1n, expectedOutputRaw: 1n, maxSlippageBps: 50, timestampMs: Date.now(), riskApproved: true },
  });

  it('moves UNKNOWN to CONFIRMED only with confirmed chain evidence', async () => {
    const store: any = { updateTrade: vi.fn().mockResolvedValue(undefined), append: vi.fn().mockResolvedValue(undefined) };
    const connection: any = {
      getSignatureStatuses: vi.fn(async () => ({ value: [{ confirmationStatus: 'finalized', err: null }] })),
      getParsedTransaction: vi.fn(async () => ({ slot: 42, meta: { err: null } })),
    };
    const result = await reconcileUnknownTrade(unknownTrade(), connection, store);
    expect(result.state).toBe('CONFIRMED');
    expect(store.updateTrade).toHaveBeenCalledWith('trade-unknown', expect.objectContaining({ state: 'CONFIRMED' }));
  });

  it('moves UNKNOWN to CONFIRMATION_FAILED only with explicit chain error', async () => {
    const store: any = { updateTrade: vi.fn().mockResolvedValue(undefined), append: vi.fn().mockResolvedValue(undefined) };
    const connection: any = {
      getSignatureStatuses: vi.fn(async () => ({ value: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] } }] })),
    };
    const result = await reconcileUnknownTrade(unknownTrade(), connection, store);
    expect(result.state).toBe('CONFIRMATION_FAILED');
    expect(store.updateTrade).toHaveBeenCalledWith('trade-unknown', expect.objectContaining({ state: 'CONFIRMATION_FAILED' }));
  });

  it('does not manufacture a failure when the signature is still absent from RPC history', async () => {
    const store: any = { updateTrade: vi.fn(), append: vi.fn() };
    const connection: any = { getSignatureStatuses: vi.fn(async () => ({ value: [null] })) };
    const result = await reconcileUnknownTrade(unknownTrade(), connection, store);
    expect(result.state).toBe('UNKNOWN');
    expect(result.reason).toBe('SIGNATURE_NOT_VISIBLE_YET');
    expect(store.updateTrade).not.toHaveBeenCalled();
  });
});
