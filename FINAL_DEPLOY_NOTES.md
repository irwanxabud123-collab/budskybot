# Budsky V9 Final Deploy Notes

This build includes the frontend CSP/button repair, in-app PAPER/LIVE control UI, premium OHLCV candlesticks, market search, paper positions, and rate-limit-aware technical analysis.

Technical analysis is derived from GeckoTerminal 15m OHLCV. The public GeckoTerminal API is rate-limited, so the market scanner only preloads technical data for the top three opportunities and caches it; other markets load TA on demand when Full Analysis is opened. This avoids the previous bulk-call pattern that could cause every TA value to become MISSING.

Probability remains NOT CALIBRATED unless a validated backtest seed artifact exists at BACKTEST_SEED_PATH. No probability is fabricated.

LIVE remains gated by the deployment-level safety configuration, durable control state, wallet authentication, risk checks, transaction inspection, and reconciliation.

Verification in this sandbox: JS syntax/static source inspection only. Network-backed npm install/build/test and real Netlify/Supabase integration were not executed here.
