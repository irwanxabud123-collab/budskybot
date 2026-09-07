# Budsky V9 — Controlled-Capital Mainnet Test Plan

**Purpose:** prove the complete execution/reconciliation path on Solana mainnet with deliberately small capital before any increase in exposure.

> **This plan is a gate, not evidence that a mainnet test has already happened.** No real-money test is claimed here.

## Recommended initial capital

**Recommended starting test bankroll: USD 25–50 equivalent in the settlement asset.**

Suggested first-stage limits:

- Maximum position: **USD 2–5 per trade**.
- Maximum total exposure: **USD 5–10**.
- Maximum daily loss: **USD 2**.
- Maximum single-trade loss: **USD 1**.
- Keep a separate SOL fee reserve; do not count the fee reserve as trading capital.

The purpose is operational validation, not profit maximization. If the strategy cannot execute/reconcile safely at this size, adding capital only increases the loss surface.

## Test duration

Run the first controlled-capital stage for **7 calendar days** or until at least **20 completed mainnet trades** have been observed, whichever takes longer.

If the system generates fewer than 20 valid opportunities, do not manufacture trades merely to hit the count. Extend the observation window.

## Stage 0 — Preconditions

Do not start real-money testing until all are true:

- [ ] `npm ci`, lint, build, test and functional audit pass in the separate networked verification environment.
- [ ] Supabase migration is applied and RLS has been independently verified.
- [ ] The exact production Jupiter transaction shape has been manually reviewed.
- [ ] `ALLOWED_PROGRAM_IDS` has been manually finalized.
- [ ] A non-exportable signing adapter has been manually verified with a real account/key, if server-side signing is used.
- [ ] LIVE kill switch and emergency stop have been tested.
- [ ] UNKNOWN reconciliation worker/trigger is deployed and observable.
- [ ] Duplicate/idempotency behavior has been tested.
- [ ] Wallet and fee reserve are sufficient for the full test window.

## Stage 1 — First live transactions

For the first 3 trades:

1. Start with the smallest allowed position, preferably around **USD 2**.
2. Monitor every transaction individually.
3. Record:
   - quote timestamp
   - request ID
   - transaction signature
   - submitted/confirmed timestamps
   - confirmation status
   - final chain error, if any
   - input debit
   - output credit
   - fees
   - realized slippage
   - final Budsky state
4. Confirm that the durable trade record and replay event match the chain evidence.
5. Do not increase size during these first 3 trades.

## Stage 2 — Controlled 7-day run

After the first 3 trades show clean reconciliation, continue with the small limits above.

Monitor at least:

- UNKNOWN count and age.
- CONFIRMATION_FAILED count.
- Duplicate/idempotency incidents.
- Jupiter `/execute` errors.
- RPC timeouts.
- Signature-not-visible events.
- Reconciliation completion time.
- Slippage versus quote.
- Actual fees.
- Daily and total drawdown.
- Any transaction whose program IDs differ from the reviewed allowlist.

## Automatic FAIL criteria

Stop live trading immediately if **any** of these occurs:

1. A transaction is broadcast twice for one idempotency key.
2. A transaction is marked CONFIRMED without chain confirmation evidence.
3. A failed on-chain transaction is recorded as successful.
4. An UNKNOWN transaction cannot be reconciled and remains unresolved for more than **15 minutes** without an explicit operational reason.
5. The system retries `/execute` automatically after an ambiguous result.
6. A transaction contains an unexpected top-level program ID.
7. Input/output mint or amount does not match the approved transaction intent.
8. A secret/private key is observed in logs, responses, artifacts, or browser payloads.
9. Supabase persistence becomes unavailable while the bot would otherwise continue executing.
10. Daily loss exceeds the USD 2 test limit or any configured hard risk limit is bypassed.
11. Emergency stop/kill-switch behavior is found not to work.
12. Any critical security anomaly is discovered.

A FAIL means: **stop execution, preserve evidence, diagnose, repair, and restart Stage 1. Do not simply increase the limits later.**

## PASS criteria for the first stage

Before increasing capital, require all of the following:

- [ ] At least 20 completed trades, or a longer observation period if fewer valid opportunities occur.
- [ ] 100% of submitted signatures are either confirmed with chain evidence or explicitly failed with chain evidence.
- [ ] No unexplained UNKNOWN older than 15 minutes.
- [ ] Zero duplicate broadcasts for an idempotency key.
- [ ] Zero unexpected allowlisted-program incidents.
- [ ] Zero secret/key exposure incidents.
- [ ] Zero critical reconciliation mismatches.
- [ ] All risk limits behaved as configured.
- [ ] No emergency-stop failure.
- [ ] Durable Supabase records agree with chain evidence for sampled transactions.
- [ ] Operational logs are complete enough to reconstruct every test transaction.

### Trading-performance gate

Do **not** use short-run P&L alone as proof of strategy quality. For the capital-increase decision, require at least:

- no breach of operational risk limits;
- no evidence of systematic execution loss beyond the configured slippage budget;
- observed realized P&L consistent with the approved risk model;
- no unresolved data-quality/calibration anomaly.

A profitable 20-trade sample is **not** sufficient evidence of durable edge.

## Stage 3 — First capital increase

If Stage 1 passes, increase only one dimension at a time.

Example:

- Stage 1: USD 25–50 bankroll, USD 2–5 position.
- Stage 2: increase position limit by no more than **2×** while keeping the same strategy/risk rules.
- Observe another **7 days / 20+ completed trades**.
- Only after another clean stage consider increasing total exposure.

Never increase position size, total exposure, strategy logic, signer architecture and token universe simultaneously.

## Rollback procedure

If a gate fails:

1. Set LIVE execution to disabled.
2. Keep the wallet funded only with the minimum needed for investigation/fees.
3. Preserve transaction signatures and Supabase records.
4. Export the relevant replay/execution evidence.
5. Reproduce the failure in a test environment where possible.
6. Repair the code/configuration.
7. Re-run failure-injection and integration tests.
8. Restart at Stage 1 with the smallest position.

## Final rule

**Controlled-capital success is an execution/reconciliation validation, not a declaration that the trading strategy is profitable or production-safe at scale.** Any capital increase requires a new review of risk limits, signer security, transaction allowlist, calibration evidence and operational reliability.
