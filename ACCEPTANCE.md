# Acceptance / release gates

This repository is deployable as a Netlify + Supabase DRY_RUN/PAPER service. It is **not** a claim that real-money LIVE trading is safe or profitable.

## Implemented gates
- Safe default `MODE=DRY_RUN` and `LIVE_ENABLED=false`.
- Explicit risk gate; execution cannot proceed without approval.
- Mint validation against Solana RPC.
- Jupiter Swap API V2 `/order` + `/execute` integration.
- Quote freshness, amount, mint, output, threshold and price-impact validation.
- BigInt raw token amounts.
- Supabase durable trade/event persistence and idempotency key.
- No automatic retry of the managed execution POST.
- Unknown existing trade state blocks re-execution.
- Netlify Functions and deployment configuration.
- API bearer-token gate when `API_AUTH_TOKEN` is configured.
- LIVE transaction program/account allowlist inspection before signing.

## LIVE remains blocked until all are verified
- Production signer isolated behind KMS/HSM or equivalent non-exportable signing service.
- Explicit, reviewed program-ID allowlist for every permitted Jupiter route/program used by the deployment.
- Full instruction-level semantic validation for the exact strategy and permitted swap semantics.
- Balance/position reconciliation against chain state after every execution and after recovery.
- Lease expiry/recovery process and operational lock cleanup under crash conditions.
- Solana RPC/Jupiter failure-injection tests and crash tests at every transaction state.
- Controlled-capital mainnet integration test.
- Independent security review.
- Token policy including authorities, transfer hooks, liquidity and blacklist/allowlist sources.
- Alerting/on-call, secret rotation, and incident-response procedures.
- Successful local `npm ci`, `npm run build`, and `npm test` in a networked dependency environment.

Never mark these items complete based on static inspection alone.


## Runtime LIVE unlock
LIVE is not source-code locked. It is explicitly enabled by environment variables and requires a runtime signer, Supabase persistence, an idempotency key, transaction program allowlisting, transaction simulation, and Jupiter execution. The provided signer is an environment-backed Keypair implementation; high-value institutional deployments should replace it with a KMS/HSM signer before using significant capital.


## Real-time UI acceptance boundary
- [x] Responsive desktop/mobile dashboard shell
- [x] Live market scanner endpoint using Jupiter Tokens API V2 ranked feeds
- [x] 20-second client refresh with timestamp/source shown
- [x] Opportunity ranking with transparent Technical / Market / Risk scores
- [x] Meme/altcoin/large-cap categorisation without treating symbols as identity
- [x] Browser-side Phantom/Solflare connection detection
- [x] Wallet portfolio read path through Solana RPC
- [x] Browser-wallet path is implemented as Budsky → Risk → Jupiter order → wallet signature → Jupiter execute → chain-status verification.
- [x] Live risk snapshot checks current wallet USDC, SOL reserve, on-chain token exposure and Jupiter prices before approval.
- [x] Signed transaction is re-inspected against wallet, input mint and exact input amount before Jupiter execution.
- [x] Exact unsigned Jupiter transaction is simulated before signing.
- [x] `LIVE_BROWSER_EXECUTION_ENABLED=false` is an explicit final runtime gate; it remains locked until the remaining mainnet/security/recovery tests below pass.
- [ ] Browser-wallet live execution enabled for real capital (intentionally locked pending the remaining release gates).

## Audit pass — 2026-09-07

Additional hardening completed:
- Browser execution now requires cryptographic verification of the supplied transaction signatures, not merely the presence of non-zero signature bytes.
- Legacy SERVER-signing `/api/live` checks its LIVE-mode gate before bearer authorization, avoiding an incorrect auth response when the endpoint is disabled.
- Browser prepare-trade responses now return the persisted idempotent trade transaction/request/quote when a concurrent persistence race resolves to an existing trade.
- Added a regression assertion that configuration defaults to `DRY_RUN` when `MODE` is absent.

Verification performed in this environment:
- ZIP integrity: PASS.
- Browser JavaScript syntax: PASS.
- TypeScript syntax/transpile sweep: PASS with `--noCheck`.
- Full TypeScript typecheck: BLOCKED because dependencies/type definitions are not installed.
- `npm install --ignore-scripts --no-audit --no-fund`: attempted but timed out in this environment.
- Vitest suite: NOT RUN because `vitest` is unavailable without dependency installation.
- Mainnet Jupiter/Solana E2E: NOT RUN.


## Latest V4 hardening pass
- Wallet must be a required transaction signer, not merely present in static account keys.
- If Jupiter `/execute` throws after signing, the trade is persisted as `UNKNOWN` and the signed transaction signature is retained when derivable; no automatic retry occurs.
- Added baseline browser security headers (CSP, frame denial, MIME sniffing and permissions policy).
- UI now displays the actual configured operating mode instead of hard-coded `LIVE`.
- LIVE remains blocked until dependency installation, full typecheck/test, real Jupiter/Solana integration, and the remaining security gates are independently verified.

## Latest verification hardening (V5)
- Canonical base64 validation added for prepared/signed transaction payloads.
- Input SPL/Token-2022 source account must be owned by the authenticated wallet, not merely delegated to it.
- Browser execute idempotent terminal responses now preserve the actual `RECONCILED` state instead of relabeling it `CONFIRMED`.
- Static syntax validation passed across all 34 source files in the audit workspace.
- Full dependency-backed TypeScript/Vitest execution remains unverified because dependency installation timed out in the audit environment.

## v8 data/replay audit correction
- Durable replay storage via Supabase `replay_events`.
- Quote events use the real trade id rather than synthetic placeholder ids.
- On-chain fee capture from transaction metadata; fee USD only when SOL/USD observation is available.
- Bid/ask, depth_1pct, and volatility are never inferred from unrelated fields.
- Replay price-impact derivation is causal and pair-specific.
- Realized P&L is required for performance claims; entry-only events are insufficient.
- Risk daily loss/drawdown no longer use repeated mark-to-market estimates of historical buys.
- Execution lock is wallet-scoped rather than global.
- Legacy execution requires chain observability before CONFIRMED.
- Empty dataset remains NEED LIVE DATA; no synthetic performance is generated.
