import { randomUUID } from 'node:crypto';
function tokenDelta(parsed, wallet, mint) {
    if (!parsed?.meta)
        return null;
    const pre = (parsed.meta.preTokenBalances ?? []).filter(x => x.owner === wallet && x.mint === mint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    const post = (parsed.meta.postTokenBalances ?? []).filter(x => x.owner === wallet && x.mint === mint).reduce((n, x) => n + BigInt(x.uiTokenAmount.amount), 0n);
    return post - pre;
}
export function realizedOutputSlippageBps(parsed, wallet, outputMint, quotedOut) {
    const actual = tokenDelta(parsed, wallet, outputMint);
    if (actual === null || quotedOut <= 0n || actual < 0n)
        return null;
    return Number((quotedOut - actual) * 10000n / quotedOut) / 100;
}
export function actualFeeLamports(parsed) { return parsed?.meta?.fee === undefined ? null : parsed.meta.fee; }
export function makeReplayEvent(args) {
    const { trade, quote } = args;
    const c = args.context ?? {};
    const observed = (x) => x === null || x === undefined ? 'MISSING' : 'OBSERVED';
    const bid = c.bid ?? null, ask = c.ask ?? null, mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
    const ms = { bid, ask, mid, spread_bps: c.spreadBps ?? (bid !== null && ask !== null ? ((ask - bid) / ((bid + ask) / 2)) * 10000 : null), source: c.market?.source ?? null, provenance: bid !== null && ask !== null ? 'OBSERVED' : 'MISSING' };
    const liquidityValue = c.depth1pct ?? c.poolTVL ?? (c.market?.estimatedLiquidityUsd ?? null);
    return { execution_mode: c.executionMode ?? 'ON_CHAIN', schema_version: '2.0.0', event_id: randomUUID(), timestamp_ms: Date.now(), trade_id: trade.tradeId, position_id: c.positionId ?? null, pair: `${trade.intent.inputMint}/${trade.intent.outputMint}`, side: args.side ?? null, event_type: args.eventType ?? 'EXECUTION',
        market_snapshot: ms,
        jupiter_quote: { inAmount: quote?.inAmount.toString() ?? null, outAmount: quote?.outAmount.toString() ?? null, minOutputAmount: quote?.minOutputAmount.toString() ?? null, slippageBps: quote?.slippageBps ?? null, priceImpactPct: quote?.priceImpactPct ?? null, route: extractArray(quote?.raw, 'route'), routePlan: extractArray(quote?.raw, 'routePlan'), requestId: quote?.requestId ?? null, quotedAtMs: quote?.timestampMs ?? null, provenance: observed(quote) },
        liquidity: { poolTVL: c.poolTVL ?? c.market?.estimatedLiquidityUsd ?? null, depth_1pct: c.depth1pct ?? null, source: c.poolTVL !== null || c.depth1pct !== null ? 'runtime-market-context' : null, provenance: c.poolTVL !== null || c.depth1pct !== null ? 'OBSERVED' : 'MISSING' },
        token_data: { volatility_1h: c.volatility1h ?? null, volatility_24h: c.volatility24h ?? null, source: c.volatility1h !== null || c.volatility24h !== null ? 'runtime-token-context' : null, provenance: c.volatility1h !== null || c.volatility24h !== null ? 'OBSERVED' : 'MISSING' },
        risk_engine: { maxPosition: c.riskState?.requestedPositionUsd ?? null, riskScore: null, decision: c.risk?.decision ?? null, reason: c.risk?.reason ?? null, provenance: c.risk ? 'OBSERVED' : 'MISSING' },
        execution: { latency_ms: args.executionLatencyMs ?? null, slippage_bps: args.actualSlippageBps ?? null, fee_usd: args.feeUsd ?? null, fee_lamports: args.feeLamports ?? null, success: args.success ?? null, error_code: args.errorCode ?? null, signature: trade.signature ?? null, confirmation_status: c.confirmationStatus ?? null, provenance: args.success === null || args.success === undefined ? 'MISSING' : 'OBSERVED' },
        pnl: { gross_pnl_usd: c.grossPnlUsd ?? null, net_pnl_usd: c.netPnlUsd ?? null, notional_usd: c.notionalUsd ?? null, provenance: c.netPnlUsd === null || c.netPnlUsd === undefined ? 'MISSING' : 'OBSERVED' },
        strategy: c.strategy ? { name: c.strategy.name, version: c.strategy.version, model_version: c.strategy.modelVersion ?? null, calibration_version: c.strategy.calibrationVersion ?? null, feature_version: c.strategy.featureVersion ?? null, action: c.strategy.action, signal_id: c.strategy.signalId ?? trade.signalId, probability: c.strategy.probability ?? null, raw_probability: c.strategy.rawProbability ?? null, calibration_status: c.strategy.calibrationStatus ?? null, calibration_source: c.strategy.calibrationSource ?? null, ta_score: c.strategy.taScore ?? null, fa_score: c.strategy.faScore ?? null, market_quality_score: c.strategy.marketQualityScore ?? null, risk_score: c.strategy.riskScore ?? null, expected_value: c.strategy.expectedValue ?? null, entry: c.strategy.entry ?? null, stop_loss: c.strategy.stopLoss ?? null, take_profit: c.strategy.takeProfit ?? null, risk_reward: c.strategy.riskReward ?? null, sample_size: c.strategy.sampleSize ?? null, data_quality: c.strategy.dataQuality ?? null, regime: c.strategy.regime ?? null, bullish_reasons: c.strategy.bullishReasons ?? [], bearish_reasons: c.strategy.bearishReasons ?? [], neutral_reasons: c.strategy.neutralReasons ?? [] } : null,
        position: { entry_price: null, entry_fee: null, entry_slippage: null, exit_price: null, exit_fee: null, exit_slippage: null, realized_gross_pnl: null, realized_net_pnl: null, unrealized_pnl: null, tx_signature: trade.signature ?? null, provenance: 'MISSING' },
        raw: { quote: quote?.raw ?? null, token: c.token ?? null, simulation: null, chain_meta: c.parsed?.meta ?? null } };
}
function extractArray(raw, key) { if (!raw || typeof raw !== 'object')
    return null; const v = raw[key]; return Array.isArray(v) ? v : null; }
