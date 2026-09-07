import { Connection, PublicKey } from '@solana/web3.js';
import type { Config } from '../config/config.js';
import type { RiskState } from '../domain/types.js';
import { SupabaseEventStore } from '../persistence/event-store.js';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu7';

interface Holding { mint: string; raw: bigint; decimals: number; }
interface PriceRow { usdPrice?: number; }

async function prices(c: Config, mints: string[]): Promise<Record<string, number>> {
  if (!c.JUPITER_API_KEY) throw new Error('JUPITER_API_KEY_REQUIRED_FOR_RISK_PRICING');
  const unique = [...new Set(mints)].slice(0, 50);
  if (!unique.length) return {};
  const url = `https://api.jup.ag/price/v3?ids=${unique.join(',')}`;
  const r = await fetch(url, { headers: { 'x-api-key': c.JUPITER_API_KEY }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`JUPITER_PRICE_${r.status}`);
  const data = await r.json() as Record<string, PriceRow>;
  const out: Record<string, number> = {};
  for (const mint of unique) {
    const p = Number(data[mint]?.usdPrice);
    if (Number.isFinite(p) && p > 0) out[mint] = p;
  }
  return out;
}

async function holdings(connection: Connection, wallet: PublicKey): Promise<Holding[]> {
  const programs = [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map(x => new PublicKey(x));
  const results = await Promise.all(programs.map(programId => connection.getParsedTokenAccountsByOwner(wallet, { programId }, 'confirmed')));
  const map = new Map<string, Holding>();
  for (const result of results) {
    for (const account of result.value) {
      const info = (account.account.data as any).parsed?.info;
      const token = info?.tokenAmount;
      if (!info?.mint || !token?.amount) continue;
      const raw = BigInt(String(token.amount));
      if (raw <= 0n) continue;
      const current = map.get(info.mint);
      map.set(info.mint, { mint: info.mint, raw: (current?.raw ?? 0n) + raw, decimals: Number(token.decimals ?? 0) });
    }
  }
  return [...map.values()];
}

export async function loadLiveRiskState(
  connection: Connection,
  c: Config,
  wallet: PublicKey,
  requestedPositionUsd: number,
  outputMint: string,
  store: SupabaseEventStore,
): Promise<RiskState> {
  const [balance, tokenHoldings] = await Promise.all([
    connection.getBalance(wallet, 'confirmed'),
    holdings(connection, wallet),
  ]);
  const usdc = tokenHoldings.find(x => x.mint === USDC);
  const walletUsdcUsd = Number(usdc?.raw ?? 0n) / 1e6;
  const nonStable = tokenHoldings.filter(x => x.mint !== USDC);
  const priceMints = [...new Set([WSOL, ...nonStable.map(x => x.mint)])];
  const priceMap = await prices(c, priceMints);

  let totalExposureUsd = 0;
  let tokenExposureUsd = 0;
  for (const h of nonStable) {
    const price = priceMap[h.mint];
    if (price === undefined) throw new Error(`RISK_PRICE_UNAVAILABLE:${h.mint}`);
    const usd = Number(h.raw) / 10 ** h.decimals * price;
    if (!Number.isFinite(usd)) throw new Error(`RISK_EXPOSURE_INVALID:${h.mint}`);
    totalExposureUsd += usd;
    if (h.mint === outputMint) tokenExposureUsd += usd;
  }
  const solPrice = priceMap[WSOL];
  if (solPrice === undefined) throw new Error('RISK_SOL_PRICE_UNAVAILABLE');
  // Wallet SOL is liquidity/reserve, not open trading exposure. Only held non-stable tokens count as exposure.
  const balanceLamports = BigInt(balance);
  void solPrice; // still required to prove the price feed is healthy before approving.
  void balanceLamports;

  const riskTrades = await store.getRiskTrades(wallet.toBase58());
  const confirmed = riskTrades.filter(t => t.state === 'CONFIRMED' || t.state === 'RECONCILED');
  const uncertainStates = new Set(['UNKNOWN','SUBMITTED','CONFIRMING','SIGNED','TRANSACTION_BUILT']);
  const hasUncertainTrade = riskTrades.some(t => uncertainStates.has(t.state));
  const failedStates = new Set(['SUBMISSION_FAILED', 'CONFIRMATION_FAILED', 'SIMULATION_FAILED', 'SIGNING_FAILED']);
  const failedTrades = riskTrades.filter(t => failedStates.has(t.state) && Date.now() - t.createdAtMs <= 24 * 60 * 60 * 1000).length;
  let consecutiveLosses = 0;
  const realized = confirmed.filter(t => t.tradeSide === 'EXIT' && typeof t.realizedPnlUsd === 'number' && Number.isFinite(t.realizedPnlUsd)).sort((a,b)=>b.createdAtMs-a.createdAtMs);
  for (const t of realized) { if ((t.realizedPnlUsd??0) < 0) consecutiveLosses++; else break; }

  // Daily loss and drawdown must use realized P&L, not the current mark-to-market
  // value of an open position. Using current holdings against every historical buy
  // double-counted losses and could falsely trip/avoid the risk engine.
  let dailyLossUsd = 0;
  let cumulativeRealized = 0;
  let peakRealized = 0;
  let realizedDrawdown = 0;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  for (const trade of confirmed.filter(t => t.tradeSide === 'EXIT').sort((a,b)=>a.createdAtMs-b.createdAtMs)) {
    const pnl = trade.realizedPnlUsd;
    if (typeof pnl !== 'number' || !Number.isFinite(pnl)) continue;
    cumulativeRealized += pnl;
    peakRealized = Math.max(peakRealized, cumulativeRealized);
    realizedDrawdown = Math.max(realizedDrawdown, peakRealized - cumulativeRealized);
    if (trade.createdAtMs >= todayStart.getTime() && pnl < 0) dailyLossUsd += Math.abs(pnl);
  }
  const hasRealizedPnlGap = confirmed.some(t => t.tradeSide === 'EXIT' && t.realizedPnlUsd === undefined);

  return {
    totalExposureUsd,
    tokenExposureUsd,
    dailyLossUsd,
    drawdownUsd: realizedDrawdown,
    failedTrades,
    consecutiveLosses,
    lastTradeAtMs: confirmed.reduce((max,t)=>Math.max(max,t.createdAtMs),0),
    requestedPositionUsd,
    walletUsdcUsd,
    walletSolLamports: BigInt(balance),
    riskStateFresh: !hasUncertainTrade && !hasRealizedPnlGap,
  };
}
