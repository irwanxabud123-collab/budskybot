function isTerminal(state) {
    return new Set([
        'CONFIRMED', 'RECONCILED', 'REJECTED', 'SIGNING_FAILED', 'SUBMISSION_FAILED',
        'CONFIRMATION_FAILED', 'EXPIRED', 'SIMULATION_FAILED',
    ]).has(state);
}
/**
 * Re-checks UNKNOWN trades against Solana evidence.
 *
 * Fail-closed rules:
 * - missing signature => remain UNKNOWN
 * - signature not visible => remain UNKNOWN
 * - pending confirmation => remain UNKNOWN
 * - chain err => CONFIRMATION_FAILED
 * - confirmed/finalized + parsed meta present + meta.err absent => CONFIRMED
 *
 * This worker never retries /execute and never invents a failure from an absent
 * signature. It is intentionally one-shot; invoke it from a scheduler/cron or
 * another durable worker loop.
 */
export async function reconcileUnknownTrade(trade, connection, store) {
    if (isTerminal(trade.state)) {
        return { tradeId: trade.tradeId, previousState: trade.state, state: trade.state, ...(trade.signature ? { signature: trade.signature } : {}), reason: 'ALREADY_TERMINAL' };
    }
    if (trade.state !== 'UNKNOWN') {
        return { tradeId: trade.tradeId, previousState: trade.state, state: trade.state, ...(trade.signature ? { signature: trade.signature } : {}), reason: 'NOT_UNKNOWN' };
    }
    if (!trade.signature) {
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'UNKNOWN', reason: 'SIGNATURE_REQUIRED_FOR_RECONCILIATION' };
    }
    const statusResponse = await connection.getSignatureStatuses([trade.signature], { searchTransactionHistory: true });
    const chainStatus = statusResponse.value[0];
    if (!chainStatus) {
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'UNKNOWN', signature: trade.signature, reason: 'SIGNATURE_NOT_VISIBLE_YET' };
    }
    if (chainStatus.err) {
        const error = JSON.stringify(chainStatus.err);
        await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', signature: trade.signature, error });
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'CONFIRMATION_FAILED', signature: trade.signature, reason: 'CHAIN_TRANSACTION_FAILED' };
    }
    if (chainStatus.confirmationStatus !== 'confirmed' && chainStatus.confirmationStatus !== 'finalized') {
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'UNKNOWN', signature: trade.signature, reason: 'CHAIN_NOT_CONFIRMED_YET' };
    }
    const parsed = await connection.getParsedTransaction(trade.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!parsed?.meta) {
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'UNKNOWN', signature: trade.signature, reason: 'TRANSACTION_METADATA_NOT_VISIBLE_YET' };
    }
    if (parsed.meta.err) {
        const error = JSON.stringify(parsed.meta.err);
        await store.updateTrade(trade.tradeId, { state: 'CONFIRMATION_FAILED', signature: trade.signature, error });
        return { tradeId: trade.tradeId, previousState: trade.state, state: 'CONFIRMATION_FAILED', signature: trade.signature, reason: 'CHAIN_TRANSACTION_FAILED' };
    }
    await store.updateTrade(trade.tradeId, { state: 'CONFIRMED', signature: trade.signature, error: '' });
    await store.append('trade_reconciled', {
        tradeId: trade.tradeId,
        signature: trade.signature,
        slot: parsed.slot,
        confirmationStatus: chainStatus.confirmationStatus,
        source: 'UNKNOWN_RECONCILIATION_WORKER',
    });
    return { tradeId: trade.tradeId, previousState: trade.state, state: 'CONFIRMED', signature: trade.signature, reason: 'CHAIN_CONFIRMED' };
}
export async function reconcileUnknownTrades(connection, store) {
    const trades = await store.getTradesByState('UNKNOWN');
    const results = [];
    let reconciled = 0;
    let failed = 0;
    let stillUnknown = 0;
    let skipped = 0;
    for (const trade of trades) {
        const lockKey = `reconcile:${trade.tradeId}`;
        const claimed = await store.claimLease(lockKey, trade.tradeId, 60_000);
        if (!claimed) {
            skipped++;
            results.push({ tradeId: trade.tradeId, previousState: trade.state, state: trade.state, ...(trade.signature ? { signature: trade.signature } : {}), reason: 'RECONCILIATION_LOCK_BUSY' });
            continue;
        }
        try {
            const result = await reconcileUnknownTrade(trade, connection, store);
            results.push(result);
            if (result.state === 'CONFIRMED')
                reconciled++;
            else if (result.state === 'CONFIRMATION_FAILED')
                failed++;
            else
                stillUnknown++;
        }
        catch (e) {
            stillUnknown++;
            results.push({ tradeId: trade.tradeId, previousState: trade.state, state: 'UNKNOWN', ...(trade.signature ? { signature: trade.signature } : {}), reason: e instanceof Error ? `RECONCILIATION_RPC_ERROR:${e.message}` : 'RECONCILIATION_RPC_ERROR' });
        }
        finally {
            try {
                await store.releaseLease(lockKey);
            }
            catch { /* do not mask reconciliation result */ }
        }
    }
    return { scanned: trades.length, reconciled, failed, stillUnknown, skipped, results };
}
