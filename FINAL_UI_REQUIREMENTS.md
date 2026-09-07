# BUDSKY Final UI Requirements

This package implements the requested Jupiter-inspired compact crypto trading terminal:

- Compact dashboard with responsive market grid: 6 columns on wide desktop, 4/3 on smaller desktop/tablet, 2/1 on mobile.
- Horizontal/scrollable market area so the dashboard avoids excessive vertical page length.
- Market cards: token, symbol, price, change, market cap, volume, liquidity, opportunity/risk, TA status, actions.
- Slide-out command menu with Market Scanner, Pulse, Discover, Trending, Smart Money, AlphaScan, Watchlist, Portfolio, Positions, Backtest, Control.
- Market trading panel with Market / Limit / DCA modes and USD/IDR input.
- Limit order review with target price, amount, total, pending order list, and cancel.
- DCA configuration with total/entry amount, entry count, interval, optional trigger, preview, active status, pause/edit/cancel.
- USD/IDR display switch with live FX lookup and fallback rate.
- Watchlist stored locally in the browser.
- Discovery views use Jupiter market feeds already fetched by the market scanner. Smart Money explicitly labels wallet-level analytics as unavailable rather than fabricating wallet P/L/win-rate data.
- Existing PAPER/LIVE wallet safety gates, premium candlesticks, GeckoTerminal TA, wallet authentication, portfolio, positions, and server-side execution controls are retained.

Safety note: LIVE execution remains server-gated and requires wallet signature. LIMIT/DCA LIVE are planner-only in this UI; they do not submit real transactions automatically.
