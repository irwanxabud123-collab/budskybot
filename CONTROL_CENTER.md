# Budsky V9 Control Center

The Control Center provides mobile-friendly operational switching without editing Netlify environment variables for each session.

## One-time deployment setup

1. Apply `supabase/migrations/001_trading_bot.sql` to the real Supabase project.
2. Configure `API_AUTH_TOKEN`, Supabase credentials, RPC/Jupiter settings, and all normal LIVE safety prerequisites.
3. After the full LIVE approval checklist is complete, set the deployment base `MODE=LIVE` and `LIVE_ENABLED=true` once.
4. Keep the durable control row in `PAPER` with `live_enabled=false`.

The deployment gate is deliberately separate from the daily operational switch. The UI can never bypass `MODE=LIVE`, `LIVE_ENABLED`, emergency-stop, signer, risk, transaction-intent, or reconciliation requirements.

## Daily use from a phone

- Open Budsky and authenticate the wallet.
- Control Center → `PAPER` for simulation/monitoring.
- Control Center → `LIVE` → explicit confirmation to arm LIVE.
- `Return to PAPER` disables new LIVE execution.
- `EMERGENCY STOP` immediately sets the durable control state to PAPER + LIVE disabled + emergency stop.

## Important safety behavior

- The control state is stored durably in Supabase, not in the ephemeral Netlify filesystem.
- LIVE activation is an authenticated operator action.
- If the control state cannot be read, LIVE execution is fail-closed.
- Emergency stop cannot be cleared by accident; clearing it is a separate explicit action and does not automatically activate LIVE.
- The control plane does not change deployment environment variables.
- This feature does not itself prove the bot is production-ready; the existing audit and controlled-capital checklist still apply.
