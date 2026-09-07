# Testing / verification

The repository contains unit tests for the Risk Engine. A real dependency installation was not available in the build environment used to produce this archive, so this release does **not** claim that `npm ci`, `npm run build`, or `npm test` passed here.

Run in a networked environment before deployment:

```bash
npm ci
npm run lint
npm run build
npm test
```

Then verify the deployed endpoints in DRY_RUN with a fresh idempotency key, repeat the same idempotency key, and confirm that the second call returns the same persisted trade rather than initiating another quote/execution.


## Latest V4 hardening pass
- Wallet must be a required transaction signer, not merely present in static account keys.
- If Jupiter `/execute` throws after signing, the trade is persisted as `UNKNOWN` and the signed transaction signature is retained when derivable; no automatic retry occurs.
- Added baseline browser security headers (CSP, frame denial, MIME sniffing and permissions policy).
- UI now displays the actual configured operating mode instead of hard-coded `LIVE`.
- LIVE remains blocked until dependency installation, full typecheck/test, real Jupiter/Solana integration, and the remaining security gates are independently verified.
