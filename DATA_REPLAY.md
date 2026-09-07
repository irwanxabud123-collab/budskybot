# Budsky Replay Dataset v2 — Data Contract

## Prinsip utama
Dataset penelitian live-replay hanya boleh berisi observasi yang benar-benar terjadi saat PAPER/LIVE. `null`/`MISSING` berarti belum tersedia. Tidak boleh mengisi latency, slippage, price impact, liquidity, fee, failure, atau P&L dengan angka contoh.

## Dua sumber kalibrasi yang sengaja dipisahkan
Budsky V9 sekarang memiliki tiga sumber model yang eksplisit:

1. **`BACKTEST_SEED`** — dihasilkan oleh `runSimpleBacktest()` dari OHLCV historis. Label adalah hasil trade simulasi yang memakai ATR stop-loss/take-profit ConservativeStrategy, bukan sekadar `next.close > current.close`. Model seed hanya boleh dibuat dari partisi training kronologis pertama 70% dan baru dianggap usable setelah >=100 candidate trade training.
2. **`PAPER_REPLAY`** — dihasilkan dari `PAPER_SIMULATED` fills. Quote dapat berasal dari Jupiter nyata, tetapi fill/fee/slippage/latency tidak membuktikan execution on-chain. Sumber ini lebih lemah dan tidak boleh masuk ke `LIVE_REPLAY`.
3. **`LIVE_REPLAY`** — dihasilkan dari trade yang benar-benar closed dan mempunyai `pnl.net_pnl_usd` realized. Jika >=100 sample tersedia, sumber ini selalu diprioritaskan dan menggantikan seed.

`BACKTEST_SEED` bukan bukti bahwa edge live telah terbukti. Seed hanya memutus deadlock bootstrap kalibrasi. LIVE dengan seed memerlukan `ALLOW_BACKTEST_SEED_LIVE=true` dan otomatis dibatasi `BACKTEST_SEED_MAX_POSITION_USD` yang jauh lebih kecil dari limit normal. Default tetap `false`.

## Bootstrap resmi
Jalankan:

```bash
npm run build
npm run backtest -- ./data/candles.csv
```

Command tersebut menulis artifact ke `BACKTEST_SEED_PATH` (default `datasets/budsky-backtest-seed.json`) hanya bila model seed memiliki minimal 30 training candidates; live/paper baru menganggapnya terkalibrasi setelah minimal 100 training samples. Artifact diberi label `source=BACKTEST_SEED` sehingga tidak pernah tercampur diam-diam dengan replay nyata.

## Event lifecycle
Satu trade dapat menghasilkan beberapa event:
`SIGNAL -> QUOTE -> EXECUTION -> RECONCILIATION -> POSITION_OPEN/POSITION_CLOSE`.
Untuk edge/P&L live, event `POSITION_CLOSE` atau event dengan `pnl.net_pnl_usd` yang benar-benar realized adalah sumber utama.

## Sumber durable
Pada Netlify, filesystem function ephemeral. `ReplayLogger` menulis ke Supabase `replay_events` bila `SupabaseEventStore` diberikan sebagai sink. JSONL lokal hanya untuk development/paper lokal dan bukan source of truth produksi.

## Yang direkam
- timestamp dan ID event/trade/position
- quote Jupiter mentah + requestId + timestamp quote
- market bid/ask hanya jika benar-benar berasal dari provider
- liquidity hanya jika provider menyediakannya
- token volatility hanya jika benar-benar tersedia
- risk decision dan konteksnya
- signature, confirmation status, latency, actual output slippage, fee lamports/USD bila dapat diukur
- raw chain metadata untuk audit
- realized P&L hanya ketika posisi benar-benar ditutup/reconciled
- calibration source (`BACKTEST_SEED`, `PAPER_REPLAY`, atau `LIVE_REPLAY`) bersama strategy metadata
- `execution_mode` (`PAPER_SIMULATED` atau `ON_CHAIN`) sebagai pemisah provenance execution

## Replay rules
1. Tidak ada future leakage. Estimasi hanya boleh memakai observasi yang timestamp-nya lebih lama dari event target dan pair yang sama.
2. Price impact yang sudah direkam dipakai sebagai OBSERVED. Jika hilang, DERIVED hanya boleh dari observasi historis pair yang sama dengan konteks liquidity/notional yang tersedia. Jika tidak cukup, MISSING.
3. Simulator tidak membuat harga ideal.
4. Stress 2x fee, 3x slippage, +200ms latency, 5% failed tx adalah skenario counterfactual, bukan fakta historis.
5. P&L live tidak boleh dihitung dari satu event entry saja. Untuk realized performance dibutuhkan lifecycle entry/exit atau realized P&L yang terverifikasi.

## Backtest methodology
Backtest sizing memakai risk budget per trade, bukan 100% cash:

`risk_budget = current_equity × riskPerTradePct`

`position_notional <= MAX_POSITION_USD` dan `position_notional <= MAX_TOTAL_EXPOSURE_USD`.

Stop distance berasal dari ATR × `atrStopMultiple`; quantity dibatasi oleh risk budget dan notional caps. Metrik Sharpe/Sortino/Calmar dihitung **per-trade dan tidak annualized**. Output selalu mencantumkan periode candle (`periodStartMs`, `periodEndMs`) dan anotasi `PER_TRADE_NOT_ANNUALIZED`.

Trade outcome untuk calibration seed ditentukan dari stop-loss/take-profit ATR pada candle setelah entry sampai exit. Jika stop dan target sama-sama tersentuh pada OHLC candle yang sama, simulator memilih stop-loss terlebih dahulu sebagai asumsi konservatif.

## Validation gate
Laporan edge live tidak berstatus READY kecuali:
- execution fields lengkap
- realized net P&L lengkap
- minimal 100 completed trades
- minimal 30 hari kalender
- OOS benar-benar berbeda periode waktu

7 hari paper trading adalah fase capture, bukan bukti edge 30 hari. Backtest seed juga bukan pengganti evidence execution live.

## PAPER_REPLAY — bukti kalibrasi terpisah
`PAPER_REPLAY` berasal dari `PAPER_SIMULATED` fills. Harga/quote Jupiter dapat nyata dan real-time, tetapi fill, fee, slippage, latency, confirmation, dan failure tidak membuktikan kondisi execution on-chain. Karena itu `PAPER_REPLAY` adalah bukti yang lebih lemah daripada `LIVE_REPLAY` dan **tidak boleh diam-diam dipromosikan menjadi LIVE_REPLAY**.

`LIVE_REPLAY` hanya menerima event `execution_mode=ON_CHAIN`. `PAPER_REPLAY` hanya menerima `execution_mode=PAPER_SIMULATED`. Jika keduanya tercampur dalam satu dataset, filter source tetap memisahkan keduanya.

Dalam mode LIVE, `PAPER_REPLAY` diblokir secara default melalui `ALLOW_PAPER_REPLAY_LIVE=false` dan cap `PAPER_REPLAY_MAX_POSITION_USD`. Gate ini terpisah dari `ALLOW_BACKTEST_SEED_LIVE`.
