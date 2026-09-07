# Budsky V9 — Draft ALLOWED_PROGRAM_IDS

> **WARNING — HUMAN REVIEW REQUIRED**
>
> **Daftar ini adalah draf awal dan WAJIB direview manual oleh manusia sebelum dipakai di LIVE — jangan langsung dipercaya.**
>
> Jangan mengisi `ALLOWED_PROGRAM_IDS` dari dokumen ini secara otomatis. Cocokkan dulu satu transaksi Jupiter yang benar-benar dibangun oleh endpoint produksi, lalu review setiap top-level instruction dan seluruh inner CPI route yang muncul di chain.

## Important distinction: Jupiter Swap V2 API vs on-chain program

Budsky menggunakan `JUPITER_BASE_URL=https://api.jup.ag/swap/v2` dan memanggil `/order` serta `/execute` di `src/execution/jupiter.ts`. **"Swap V2" di sini adalah API surface, bukan nama program Solana terpisah.**

Untuk transaksi swap yang dibangun Jupiter, program on-chain yang perlu diverifikasi adalah deployment Jupiter Aggregator yang benar-benar muncul pada transaction instructions. Dokumentasi/announcement Jupiter menyebut instruction modern seperti `route_v2`, `exact_out_route_v2`, `shared_accounts_route_v2`, dan `shared_accounts_exact_out_route_v2` pada Jupiter Aggregator v6. urlJupiter Developer Docshttps://dev.jup.ag/

## Draft initial top-level IDs

| Program | Program ID | Why it may appear | Status |
|---|---|---|---|
| Jupiter Aggregator v6 | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | Main Jupiter swap/route program; current Jupiter v6 route instructions execute through this program. | **DRAFT — verify on actual production transaction** |
| Compute Budget | `ComputeBudget111111111111111111111111111111` | Jupiter-built transactions commonly include compute-unit limit/price instructions; `execution-engine.ts`/`transaction-inspector.ts` explicitly parses this program. | **DRAFT — verify exact instructions** |
| System Program | `11111111111111111111111111111111` | May be required for account creation/lamport transfers in a built route. | **DRAFT — only allow if observed and required** |
| Associated Token Account Program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | May appear when a route needs to create an associated token account. | **DRAFT — only allow if observed and required** |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | SPL Token transfer/close instructions may be top-level in the Jupiter-built transaction. `transaction-inspector.ts` explicitly recognizes this program. | **DRAFT — verify** |
| Token-2022 Program | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu7` | May appear for Token-2022 routes. The bot currently has `ALLOW_TOKEN_2022=false`, so this should remain blocked unless that policy is deliberately changed. | **DO NOT ENABLE by default** |

The Jupiter Aggregator v6 ID above should be cross-checked against Jupiter's official documentation and the exact production instruction set before LIVE use.

## What is deliberately NOT included

### DEX/AMM programs

Do **not** add Raydium, Orca, Meteora, Phoenix, Pump.fun, etc. merely because Jupiter can route through them. `JupiterClient` does not hard-code a DEX route; `/order` returns a transaction built from the selected route. The exact DEX programs are therefore **runtime-dependent**.

Before LIVE, inspect at least one representative transaction for every route family the bot intends to permit and decide whether the current top-level allowlist is sufficient. A top-level program allowlist is **not** a substitute for semantic inspection of inner CPI instructions.

### Other Jupiter products

Do not add Jupiter Limit Order, DCA, Perpetuals, or other Jupiter programs unless this bot is explicitly changed to call those products and the resulting transaction shape has been independently reviewed.

## Required human review before LIVE

1. Generate a real Jupiter swap transaction using the exact `/swap/v2` production configuration.
2. Decode the transaction and record **every top-level program ID**.
3. Compare the list against `ALLOWED_PROGRAM_IDS`.
4. Review address lookup tables and all writable accounts.
5. Inspect inner instructions/CPI route programs on-chain.
6. Confirm the input mint, output mint, fee payer, amount and minimum output match the intent.
7. Confirm the allowlist does not accidentally permit unrelated transaction types.
8. Record the reviewed transaction signature and reviewer/date in the deployment evidence.
9. Only then populate `ALLOWED_PROGRAM_IDS` in the LIVE environment.

## Official-source starting points

- urlJupiter Developer Docshttps://dev.jup.ag/
- urlJupiter's official `jup-ag/instruction-parser` repositoryhttps://github.com/jup-ag/instruction-parser — identifies the Jupiter V6 contract and its program ID.
- urlJupiter published Swap security assessmenthttps://dev.jup.ag/assets/files/2022-08-09_Jupiter_Swap_Sec3-ccea7d83dc4965e67297b672fdbcaa92.pdf

The published audit is historical security evidence, not proof that every current Jupiter route uses the same instruction set. Current production transaction review remains mandatory.
