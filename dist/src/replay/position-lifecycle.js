import { makeReplayEvent } from './runtime-event.js';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9, USDC_DECIMALS = 6;
function tokenDelta(parsed, wallet, mint) {
    if (!parsed?.meta)
        return null;
    const pre = (parsed.meta.preTokenBalances ?? []).filter(x => x.owner === wallet && x.mint === mint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const post = (parsed.meta.postTokenBalances ?? []).filter(x => x.owner === wallet && x.mint === mint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    return post - pre;
}
function solDelta(parsed, wallet) {
    if (!parsed?.meta || !parsed.transaction.message.accountKeys)
        return null;
    const keys = parsed.transaction.message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey.toBase58());
    const i = keys.indexOf(wallet);
    if (i < 0)
        return null;
    return BigInt((parsed.meta.postBalances[i] ?? 0) - (parsed.meta.preBalances[i] ?? 0));
}
function usdFromSolLamports(lamports, quoteOutRaw, quoteInRaw, quoteInputMint, quoteOutputMint) {
    if (quoteInputMint === USDC_MINT && quoteOutputMint === SOL_MINT && quoteOutRaw > 0n) {
        return Number(lamports) / 1e9 * (Number(quoteInRaw) / 1e6) / (Number(quoteOutRaw) / 1e9);
    }
    if (quoteInputMint === SOL_MINT && quoteOutputMint === USDC_MINT && quoteInRaw > 0n) {
        return Number(lamports) / 1e9 * (Number(quoteOutRaw) / 1e6) / (Number(quoteInRaw) / 1e9);
    }
    return null;
}
function eventWithPnl(base, patch) { return { ...base, ...patch, pnl: { ...base.pnl, ...(patch.pnl ?? {}) } }; }
export function positionQuantityFromParsed(parsed, wallet, mint) { return tokenDelta(parsed, wallet, mint); }
export function buildPositionOpenEvent(trade, wallet, parsed, logger) {
    const output = tokenDelta(parsed, wallet, trade.intent.outputMint);
    const input = tokenDelta(parsed, wallet, trade.intent.inputMint);
    if (output === null || input === null)
        return null;
    const entryValueUsd = trade.intent.inputMint === USDC_MINT ? Number(-input) / 1e6 : null;
    const feeLamports = parsed.meta?.fee ?? null;
    const feeUsd = feeLamports === null ? null : usdFromSolLamports(BigInt(feeLamports), trade.quote?.outAmount ?? 0n, trade.quote?.inAmount ?? 0n, trade.intent.inputMint, trade.intent.outputMint);
    const ctx = { positionId: trade.positionId ?? trade.tradeId, parsed, confirmationStatus: 'confirmed', notionalUsd: entryValueUsd };
    const e = makeReplayEvent({ trade, wallet, quote: trade.quote ?? null, eventType: 'POSITION_OPEN', side: 'BUY', executionLatencyMs: null, success: true, errorCode: null, actualSlippageBps: null, feeUsd, feeLamports, context: ctx });
    const entryPrice = null;
    return eventWithPnl(e, { pnl: { gross_pnl_usd: 0, net_pnl_usd: feeUsd === null ? null : -feeUsd, notional_usd: entryValueUsd, provenance: feeUsd === null ? 'MISSING' : 'DERIVED' }, position: { entry_price: entryPrice, entry_fee: feeUsd, entry_slippage: null, exit_price: null, exit_fee: null, exit_slippage: null, realized_gross_pnl: 0, realized_net_pnl: feeUsd === null ? null : -feeUsd, unrealized_pnl: null, tx_signature: trade.signature ?? null, provenance: feeUsd === null ? 'MISSING' : 'DERIVED' } });
}
export function buildPositionCloseEvent(args) {
    const { entry, exit, wallet, entryParsed, exitParsed } = args;
    const entryUsdc = tokenDelta(entryParsed, wallet, USDC_MINT);
    const exitUsdc = tokenDelta(exitParsed, wallet, USDC_MINT);
    const entryToken = tokenDelta(entryParsed, wallet, entry.intent.outputMint);
    const exitToken = tokenDelta(exitParsed, wallet, entry.intent.outputMint);
    if (entryUsdc === null || exitUsdc === null || entryToken === null || exitToken === null)
        return null;
    const entryValueUsd = -Number(entryUsdc) / 1_000_000;
    const exitValueUsd = Number(exitUsdc) / 1_000_000;
    const gross = exitValueUsd - entryValueUsd;
    const entryFeeUsd = args.entryFeeUsd ?? entry.feeUsd ?? null;
    const exitFeeUsd = args.exitFeeUsd ?? exit.feeUsd ?? null;
    if (entryFeeUsd === null || exitFeeUsd === null)
        return null;
    const entryQuotedToken = entry.quote?.outAmount ?? 0n, exitQuotedUsdc = exit.quote?.outAmount ?? 0n;
    const actualEntryToken = entryToken > 0n ? entryToken : 0n, actualExitUsdc = exitUsdc > 0n ? exitUsdc : 0n;
    const entrySlippageUsd = entryQuotedToken > actualEntryToken && entry.quote ? Number(entryQuotedToken - actualEntryToken) / Number(entryQuotedToken) * (Number(entry.quote.inAmount) / 1e6) : 0;
    const exitSlippageUsd = exitQuotedUsdc > actualExitUsdc && exit.quote ? Number(exitQuotedUsdc - actualExitUsdc) / 1e6 : 0;
    const totalSlippage = entrySlippageUsd + exitSlippageUsd;
    const totalFee = entryFeeUsd + exitFeeUsd;
    // gross is derived from actual wallet balance/token deltas, so execution slippage is
    // already reflected in gross P&L. Subtract fees once; retain slippage as an observed
    // diagnostic field rather than subtracting it a second time.
    const net = gross - totalFee;
    const ctx = { positionId: entry.positionId ?? entry.tradeId, parsed: exitParsed, confirmationStatus: 'confirmed', notionalUsd: Math.abs(entryValueUsd) };
    const base = makeReplayEvent({ trade: exit, wallet, quote: exit.quote ?? null, eventType: 'POSITION_CLOSE', side: 'SELL', executionLatencyMs: null, success: true, errorCode: null, actualSlippageBps: null, feeUsd: totalFee, feeLamports: Number(BigInt(entryParsed.meta?.fee ?? 0) + BigInt(exitParsed.meta?.fee ?? 0)), context: ctx });
    return eventWithPnl(base, { pnl: { gross_pnl_usd: gross, net_pnl_usd: net, notional_usd: Math.abs(entryValueUsd), provenance: 'DERIVED' }, position: { entry_price: null, entry_fee: entryFeeUsd, entry_slippage: entrySlippageUsd, exit_price: null, exit_fee: exitFeeUsd, exit_slippage: exitSlippageUsd, realized_gross_pnl: gross, realized_net_pnl: net, unrealized_pnl: null, tx_signature: exit.signature ?? null, provenance: 'DERIVED' }, raw: { ...base.raw, chain_meta: { entrySignature: entry.signature ?? null, exitSignature: exit.signature ?? null, entryFeeUsd, exitFeeUsd, entrySlippageUsd, exitSlippageUsd, actualEntryToken: actualEntryToken.toString(), actualExitUsdc: actualExitUsdc.toString() } } });
}
export async function recordPositionUpdate(args) {
    const { trade, wallet, quote, market, logger, unrealizedPnlUsd } = args;
    const e = makeReplayEvent({ trade, wallet, quote: quote ?? null, eventType: 'POSITION_UPDATE', side: 'HOLD', executionLatencyMs: null, success: true, errorCode: null, actualSlippageBps: null, feeUsd: null, feeLamports: null, context: { ...(market ? { market } : {}), positionId: trade.positionId ?? trade.tradeId, notionalUsd: trade.notionalUsd ?? null } });
    await logger.record(eventWithPnl(e, { pnl: { gross_pnl_usd: unrealizedPnlUsd, net_pnl_usd: unrealizedPnlUsd, notional_usd: trade.notionalUsd ?? null, provenance: unrealizedPnlUsd === null ? 'MISSING' : 'DERIVED' }, position: { entry_price: null, entry_fee: null, entry_slippage: null, exit_price: null, exit_fee: null, exit_slippage: null, realized_gross_pnl: null, realized_net_pnl: null, unrealized_pnl: unrealizedPnlUsd, tx_signature: trade.signature ?? null, provenance: unrealizedPnlUsd === null ? 'MISSING' : 'DERIVED' } }));
}
