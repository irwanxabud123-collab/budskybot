# Mainnet paper / controlled execution

`npm run paper:mainnet` is intentionally **non-broadcasting** in this repository.

It may use Solana mainnet RPC + fresh Jupiter quotes, but it must not sign or broadcast a real-money transaction. The requested `WALLET_PAPER.json` / 0.1 USDC automatic broadcaster is not enabled by this codebase.

For real on-chain evidence, use the existing explicitly gated LIVE flow with an operator-controlled wallet signature and the normal transaction lifecycle. Only confirmed Solana transactions can create `POSITION_OPEN` / `POSITION_CLOSE`; quote-only paper observations cannot be promoted into those events.

Never commit `WALLET_PAPER.json`. If a local controlled test wallet is used, keep it outside Git and fund it only with capital you can afford to lose.
