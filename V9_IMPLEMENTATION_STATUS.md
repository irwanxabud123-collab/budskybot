# Budsky V9 Final Audit Status

## Implemented in this revision
- Canonical BUY/SELL/HOLD strategy with one signal contract.
- Multi-timeframe OHLCV ingestion (5m/15m/1h/4h) through GeckoTerminal with bounded cache and fail-closed behavior.
- Quote-derived entry price in the correct USD/token units instead of raw integer token amounts.
- TA feature provenance and multi-timeframe aggregation.
- On-chain fundamental collection from Solana RPC: mint/freeze authority, total supply, and top-holder concentration evidence; unavailable fields remain MISSING.
- Jupiter market-quality data remains separate from Fundamental Analysis.
- Historical replay calibration loader with chronological training split and minimum sample gate.
- Raw probability requires observed historical base rate, historical regime multiplier, TA evidence, and explicit risk-cost adjustment; no fallback probability is fabricated.
- Calibrated probability is the only confidence exposed to risk/live paths.
- Candle freshness is separately gated from quote freshness.
- Exit risk gate added before close-position preparation.
- Live/dry-run/CLI decision paths now use the same market-data + strategy context.
- Wallet SOL reserve is not counted as open trading exposure.
- Consecutive losses are calculated from realized EXIT P&L rather than transaction state alone.
- Paper fills have no hidden fee/slippage defaults and cannot underflow output.
- Browser idempotency fallback no longer uses Math.random().
- Replay regime reporting includes BULL, BEAR, SIDEWAYS, HIGH_VOLATILITY, LOW_VOLATILITY, and LIQUIDITY_STRESSED classifications when the required observations exist.
- Static audit checks expanded to cover data pipeline, calibration gates, exit risk, candle freshness, and unsafe fallbacks.

## Intentionally unavailable / fail-closed
- News/social sentiment remains MISSING until a legal authenticated provider is configured.
- Historical calibration cannot become CALIBRATED until the replay dataset contains enough observed strategy outcomes. The bundled dataset is currently empty/NEED LIVE DATA.
- A generic OHLCV CSV without historical FA cannot prove the complete production strategy edge; the backtest reports the limitation rather than inventing FA.
- Production build/test/lint cannot be claimed PASS in this environment because npm dependencies could not be installed within the execution environment.

## Safety rule
No missing provider, insufficient calibration sample, stale market data, unknown risk state, or unavailable critical feature may silently become a numeric default. The correct output is MISSING / INSUFFICIENT_DATA / HOLD / RISK_REJECTED.

## 2026-09-07 hardening pass
- `BACKTEST_SEED` is now an explicit calibration source produced by `runSimpleBacktest()` and persisted to `BACKTEST_SEED_PATH`.
- Seed labels are ATR stop-loss/take-profit trade outcomes, not next-candle direction.
- Backtest sizing uses risk-per-trade plus live-equivalent notional caps.
- Sharpe/Sortino/Calmar are explicitly per-trade and non-annualized.
- `LIVE_REPLAY` calibration reads durable Supabase `replay_events` when Supabase is configured and only accepts realized `POSITION_CLOSE` outcomes.
- Server-side environment-keypair signing has been removed from the supported LIVE path pending non-exportable KMS/HSM integration.
- New-entry token hard-block policy covers blacklist, mint/freeze authorities, and Token-2022 by default.
- Execution now fails closed to UNKNOWN when chain confirmation or parsed metadata is not safely observable.
- `/api/health` verifies Supabase REST reachability when persistence is required.
- CI uses `npm ci` as the dependency gate; a lockfile is still required before CI can pass.
