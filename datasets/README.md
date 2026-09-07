# Backtest datasets

`budsky-backtest-fixture.csv` is a **deterministic synthetic fixture**, not historical market data. It exists only to prove that the CSV loader and backtest pipeline can read a dataset and emit `datasets/budsky-backtest-seed.json`.

## Real historical OHLCV source

For production/research backtests, use pool-level OHLCV from GeckoTerminal. The official API exposes:

`GET /api/v2/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}`

For Solana, use `network=solana`, identify the actual pool address, and request `minute`, `hour`, or `day` candles as appropriate. GeckoTerminal documents the OHLCV endpoint and its Unix timestamp format in the official docs.

Suggested workflow:

1. Identify the exact Solana pool address.
2. Pull OHLCV from GeckoTerminal with a fixed timeframe/aggregate.
3. Preserve the raw source response and retrieval timestamp.
4. Convert rows to CSV with columns exactly:
   `timestamp,open,high,low,close,volume`
5. Ensure `timestamp` is Unix seconds or milliseconds; `loadCsv()` accepts either.
6. Run:
   `npm run build`
   `npm run backtest -- path/to/your.csv`
7. Keep the resulting seed artifact tied to the dataset/source and retrieval window.

The free public API is rate-limited, so do not use it as a high-frequency production feed. See the official GeckoTerminal API documentation before collecting large datasets.
