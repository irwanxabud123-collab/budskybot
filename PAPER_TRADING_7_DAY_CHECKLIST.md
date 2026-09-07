# Checklist Paper Trading 7 Hari

Setiap event harus berasal dari runtime nyata Budsky.

- [ ] timestamp_ms
- [ ] event_id / trade_id / position_id
- [ ] pair + side
- [ ] MarketSnapshot: bid/ask/mid/spread bila provider benar-benar memberi data
- [ ] Jupiter `inAmount`, `outAmount`, `otherAmountThreshold`, `slippageBps`, `priceImpact`, `requestId`, `routePlan`
- [ ] raw Jupiter response
- [ ] liquidity source, poolTVL/depth bila tersedia
- [ ] volatility 1h/24h bila tersedia
- [ ] Risk Engine maxPosition, riskScore, decision, reason
- [ ] transaction simulation result
- [ ] signature bila transaksi benar-benar signed/submitted
- [ ] execution latency: ukur dari request execute dikirim sampai hasil response, dan simpan definisinya
- [ ] actual on-chain fee lamports; fee USD hanya bila SOL/USD price juga terukur pada waktu yang sesuai
- [ ] actual output amount dari chain
- [ ] actual slippage terhadap quote
- [ ] success/failure/error code
- [ ] confirmation status
- [ ] position open
- [ ] position close / exit quote
- [ ] realized gross P&L
- [ ] realized net P&L setelah fee dan slippage
- [ ] jangan isi missing field dengan 0
- [ ] jangan menghapus trade buruk
- [ ] jangan mengubah historical event setelah dicatat; gunakan correction event jika diperlukan

## Setelah 7 hari
Export `replay_events` ke dataset immutable JSON/JSONL/Parquet, checksum file, lalu jalankan validation. Jika jumlah/periode belum memenuhi gate, laporkan NEED LIVE DATA/INSUFFICIENT SAMPLE dan lanjutkan capture.

## Paper mode clarification
`npm run paper` runs `src/index.ts paper --paper`. It uses real Jupiter quotes and records quote/signal observations, but it does **not** sign or broadcast transactions. Therefore it cannot create on-chain `POSITION_OPEN`/`POSITION_CLOSE` or claim realized P&L. Those lifecycle events require actual confirmed transactions. A 50–100 event target is an observation target, not a guaranteed trade count.
