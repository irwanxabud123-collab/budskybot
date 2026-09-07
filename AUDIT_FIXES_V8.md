# Audit Fixes — Budsky Data/Replay Infrastructure v8

## Kesalahan yang ditemukan pada V7 dan diperbaiki

1. **Replay event hanya disimpan ke JSONL lokal.**
   - Masalah: filesystem Netlify ephemeral, sehingga dataset penelitian dapat hilang.
   - Fix: `ReplayLogger` mendukung durable sink `SupabaseEventStore.appendReplayEvent()` dan tabel `replay_events`.

2. **Quote event memakai tradeId palsu.**
   - Masalah: event sulit direkonsiliasi dengan trade sebenarnya.
   - Fix: tradeId/executionId dibuat sebelum quote dan digunakan konsisten.

3. **Execution logger tidak menangkap fee on-chain.**
   - Fix: baca `meta.fee` dari transaksi terkonfirmasi; fee USD hanya diisi bila harga SOL/USD tersedia, selain itu null.

4. **Actual slippage dihitung dengan tanda yang membingungkan.**
   - Fix: slippage positif berarti actual output lebih rendah dari quoted output; dihitung dari delta token wallet terhadap quote.

5. **Bid/ask/mid pernah berisiko dianggap tersedia padahal Jupiter quote bukan order-book bid/ask.**
   - Fix: bid/ask tetap null/MISSING kecuali provider nyata mengirimkannya. Mid hanya dihitung jika bid dan ask benar-benar tersedia.

6. **Liquidity depth_1pct pernah disamakan dengan liquidity USD.**
   - Fix: kedua field dipisahkan; poolTVL/estimated liquidity tidak lagi diklaim sebagai depth_1pct.

7. **Volatility pernah berisiko dibuat dari price change.**
   - Fix: volatility tetap MISSING jika provider tidak memberikan volatility yang sesuai. Price change tidak dinamai volatility.

8. **Replay price-impact interpolation memakai observasi future dan lintas pair.**
   - Fix: hanya observasi historis sebelum timestamp target dan pair yang sama; jika konteks tidak cukup, hasil MISSING.

9. **Replay engine menghitung P&L dari event entry tunggal.**
   - Fix: realized P&L diperlakukan valid hanya jika benar-benar tercatat pada lifecycle close/realized event. Tanpa itu, statistik tidak dianggap bukti edge.

10. **Stress failed transaction 5% berisiko terbaca sebagai fakta historis.**
    - Fix: 5% hanya counterfactual seeded stress scenario.

11. **Risk Engine menghitung daily loss/drawdown dari current holdings terhadap setiap historical buy.**
    - Masalah: dapat double-count dan bukan realized P&L.
    - Fix: daily loss/drawdown hanya memakai `realizedPnlUsd`; exposure tetap berasal dari saldo on-chain. Jika realized P&L lifecycle belum lengkap, `riskStateFresh=false`.

12. **ExecutionEngine memakai global execution lock.**
    - Masalah: satu wallet dapat memblokir wallet lain.
    - Fix: lock menjadi `wallet:<publicKey>`.

13. **ExecutionEngine legacy dapat menganggap Jupiter Success sebagai CONFIRMED.**
    - Fix: cek signature status RPC dan hanya menyimpan CONFIRMED setelah chain observable tanpa error; status ambiguous menjadi UNKNOWN.

14. **CI sebelumnya bergantung pada npm cache/lock yang tidak tersedia di environment audit.**
    - Fix: GitHub runner melakukan `npm install` langsung dari registry; audit environment lokal tidak lagi dijadikan bukti bahwa source rusak.

15. **CI replay validation sebelumnya dapat dianggap sukses walaupun dataset kosong.**
    - Fix: `check-replay` hanya memvalidasi kontrak dataset. `validate-replay` tetap mengembalikan NEED LIVE DATA sebagai non-pass ketika statistik belum layak.

## Yang sengaja TIDAK diisi
- latency historis tanpa observasi runtime
- failed transaction rate historis tanpa transaksi nyata
- bid/ask tanpa sumber order-book nyata
- depth_1pct tanpa data depth nyata
- P&L tanpa exit/realized event
- Monte Carlo ruin probability tanpa initial capital
- price impact sintetis yang mengaku observed

## Release gate
V8 belum menyatakan edge terbukti dan belum menyatakan LIVE READY. Data paper harus dikumpulkan terlebih dahulu.
