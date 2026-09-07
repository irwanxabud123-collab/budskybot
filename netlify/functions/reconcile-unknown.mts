import { Connection } from '@solana/web3.js';
import { loadConfig } from '../../src/config/config.js';
import { SupabaseEventStore } from '../../src/persistence/event-store.js';
import { reconcileUnknownTrades } from '../../src/execution/reconciliation-worker.js';

export default async function (req: Request) {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  let c;
  try { c = loadConfig(); } catch { return Response.json({ error: 'config_invalid' }, { status: 503 }); }
  const expected = process.env.RECONCILIATION_CRON_SECRET?.trim();
  const supplied = req.headers.get('x-reconciliation-secret')?.trim();
  if (!expected || !supplied || supplied !== expected) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const store = new SupabaseEventStore(c);
    const connection = new Connection(c.RPC_URL, { commitment: 'confirmed' });
    const result = await reconcileUnknownTrades(connection, store);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'reconciliation_failed' }, { status: 503 });
  }
}
