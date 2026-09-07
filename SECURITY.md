# Security / Threat Model

## Assets
Private signing authority, wallet/trading capital, Jupiter credential, Supabase secret, persistent trade/risk state, transaction intent.

## Controls
1. LIVE is opt-in and off by default.
2. Strategy has no direct execution access.
3. Risk approval is explicit.
4. Token identity uses mint addresses.
5. Quotes are checked for mint, amount, output, threshold, impact and age.
6. `/execute` is never blindly retried.
7. Existing non-terminal idempotency records block re-execution until reconciled.
8. Supabase secret is server-only and never returned by API responses.
9. Transaction program/account allowlist is mandatory for LIVE when enabled.
10. Structured logs redact secret-like fields.

## Deployment security
Use Netlify Functions environment variables for secrets; do not put secrets in Git. Supabase's current API-key model uses publishable keys for clients and secret keys for backend services; secret keys bypass RLS and must remain server-side. Netlify makes environment variables available to Functions at runtime when the Functions scope is enabled. See the official docs linked from the project README.

## Residual risks
A program-ID allowlist is necessary but not sufficient to prove semantic safety of arbitrary swap instructions. LIVE therefore remains a gated release until exact instruction semantics, signer isolation, reconciliation, chaos testing and independent review are complete.


## Latest V4 hardening pass
- Wallet must be a required transaction signer, not merely present in static account keys.
- If Jupiter `/execute` throws after signing, the trade is persisted as `UNKNOWN` and the signed transaction signature is retained when derivable; no automatic retry occurs.
- Added baseline browser security headers (CSP, frame denial, MIME sniffing and permissions policy).
- UI now displays the actual configured operating mode instead of hard-coded `LIVE`.
- LIVE remains blocked until dependency installation, full typecheck/test, real Jupiter/Solana integration, and the remaining security gates are independently verified.

## Draft non-exportable signer: AWS KMS

`src/execution/signer.ts` now contains an `AwsKmsSigner` implementation using an AWS KMS **Ed25519** key. The private key remains inside KMS; the adapter requests the KMS public key, verifies that it is a required signer of the Solana transaction, signs the serialized Solana message with KMS, and inserts the returned Ed25519 signature into the versioned transaction.

Required environment variables are documented in `.env.example`:

- `AWS_REGION` / `AWS_KMS_REGION`
- `AWS_KMS_KEY_ID`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN` when explicit AWS credentials are used

Prefer an AWS workload identity/IAM role over long-lived access keys where the deployment platform supports it.

**IMPORTANT:** The AWS KMS adapter is a **draft implementation**. It has **NOT been tested with a real AWS account/KMS key in this repository**. Before LIVE, manually verify key creation, Ed25519 compatibility, public-key/address derivation, transaction signing, Solana signature validity, multi-signer behavior, IAM permissions, timeout/error handling, and key-usage audit logs. Do not enable LIVE merely because the adapter compiles.

## UNKNOWN reconciliation

`src/execution/reconciliation-worker.ts` provides a fail-closed reconciliation worker. It checks every `UNKNOWN` trade with a stored signature against Solana RPC and changes state only when there is chain evidence:

- confirmed/finalized + parsed metadata with no error -> `CONFIRMED`
- explicit chain error -> `CONFIRMATION_FAILED`
- signature absent, pending, or metadata not yet visible -> remains `UNKNOWN`

It never retries Jupiter `/execute` and never invents a failure from an absent signature. The worker can be invoked with `npm run reconcile:unknown` or through the protected `/api/reconcile-unknown` trigger using `RECONCILIATION_CRON_SECRET`.

## Draft ALLOWED_PROGRAM_IDS

See `ALLOWED_PROGRAM_IDS_DRAFT.md`.

**Daftar ini adalah draf awal dan WAJIB direview manual oleh manusia sebelum dipakai di LIVE — jangan langsung dipercaya.** The Jupiter Swap V2 API surface is not itself a distinct Solana program ID; the actual on-chain Jupiter Aggregator program and any auxiliary top-level programs must be verified from real production-built transactions.

## Paper calibration isolation
Paper fills are tagged `execution_mode=PAPER_SIMULATED` and use calibration source `PAPER_REPLAY`. They are never eligible for `LIVE_REPLAY` calibration. In LIVE mode, PAPER_REPLAY is blocked by default and requires the separate `ALLOW_PAPER_REPLAY_LIVE=true` gate plus its position cap. This is intentionally weaker evidence than confirmed on-chain execution.
