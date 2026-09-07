# Budsky V2 — Token Detail + Automatic Market Analysis

This is a feature extension to the existing V2 terminal. It reuses the existing market scanner, Opportunity engine, GeckoTerminal OHLCV source, canonical strategy/FA engine, risk score, Paper/Live trading flow, wallet state, and USD/IDR state.

## Added
- Dynamic Token Detail view opened from Market Scanner, Trending, Discover, Smart Money, Watchlist, and AlphaScan cards/rows.
- Real token-specific OHLCV chart with 5m/15m/30m/1h/4h/1D support where the existing provider can supply or safely aggregate candles; 1m reports unavailable instead of fabricating candles.
- Real token market header: price, change, market cap, FDV, liquidity, holders when supplied, 24h volume, buy/sell/net flow. Missing fields show N/A.
- Existing trading flow is reused for Market/Limit/DCA and Paper/Live.
- Automatic technical, fundamental, risk, and smart-money/market-flow panels.
- Existing Budsky Opportunity/Risk/Market Quality scores are displayed; no second scoring system was introduced.
- Automatic verdict reasons are derived from the current token's actual indicators and existing opportunity reasons.
- Real-time refresh: price polling plus periodic analysis refresh while Token Detail is open.

## Data integrity
No mock market data, hardcoded token prices, fake candles, or fabricated probability values were added. The existing calibration rule remains: probability is only shown when a validated calibration artifact exists.
