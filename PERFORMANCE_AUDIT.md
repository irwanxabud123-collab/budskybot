# Budsky Bot — Performance Audit Status

## Kesimpulan saat ini
**BUKTI BELUM CUKUP UNTUK MENYATAKAN BOT MEMILIKI EDGE LIVE YANG TERBUKTI.**

Status utama: **NOT READY** sampai dependency verification, historical OOS validation, execution evidence, dan independent security review benar-benar selesai.

## Bootstrap kalibrasi V9
Deadlock kalibrasi telah diputus secara eksplisit. `runSimpleBacktest()` sekarang menghasilkan artifact `BACKTEST_SEED` yang dapat dibaca `calibration-store.ts`. Seed dilatih dari hasil trade simulasi ATR stop-loss/take-profit pada partisi kronologis awal 70%; label bukan lagi arah candle berikutnya. Seed tidak dicampur dengan `LIVE_REPLAY`.

`LIVE_REPLAY` selalu diprioritaskan ketika >=100 closed trades dengan realized `net_pnl_usd` tersedia. Sebelum itu, seed dapat digunakan sebagai bootstrap hanya dengan flag `ALLOW_BACKTEST_SEED_LIVE=true`; LIVE seed otomatis dibatasi oleh `BACKTEST_SEED_MAX_POSITION_USD`. Default flag tersebut `false`.

## Batasan metodologi seed
- Seed berasal dari OHLCV historis, bukan fill Jupiter historis.
- Historical FA/news/social tidak boleh diada-adakan dari candle.
- Fee/slippage pada backtest adalah parameter simulasi eksplisit, bukan observasi live.
- Seed boleh membantu bootstrap model, tetapi tidak membuktikan execution edge.
- Metrik Sharpe/Sortino/Calmar adalah per-trade dan tidak annualized; periode data selalu dilaporkan.

## Gate statistik live
Minimum untuk laporan edge yang lebih bermakna:
- >=100 completed trades
- >=30 hari data
- execution completeness 100% untuk trade yang dianalisis
- realized net P&L lengkap
- OOS terpisah secara kronologis
- walk-forward window 30 hari tersedia

Angka minimum ini bukan jaminan statistical significance; confidence interval dan konteks regime tetap wajib diperiksa.

## Verification status
`npm ci`, `npm run lint`, `npm run build`, dan `npm test` harus menjadi bukti eksekusi CI Node 22. Arsip ini belum dapat mengklaim keempatnya PASS karena environment audit saat ini tidak memiliki akses DNS/network ke npm registry dan ZIP tidak berisi `package-lock.json`. CI telah diubah menjadi `npm ci` agar merge gagal bila lockfile/reproducible dependency install belum tersedia.
