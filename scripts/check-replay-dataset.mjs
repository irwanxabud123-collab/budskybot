import { readFile } from 'node:fs/promises';
const path = process.argv[2] ?? 'datasets/budsky-replay.json';
const d = JSON.parse(await readFile(path, 'utf8'));
if (d.schema_version !== '2.0.0') throw new Error('REPLAY_SCHEMA_VERSION_INVALID');
if (!['LIVE','PAPER','REPLAY'].includes(d.source)) throw new Error('REPLAY_SOURCE_INVALID');
if (!['READY','NEED LIVE DATA'].includes(d.status)) throw new Error('REPLAY_STATUS_INVALID');
if (!Array.isArray(d.events)) throw new Error('REPLAY_EVENTS_MUST_BE_ARRAY');
for (const [i,e] of d.events.entries()) {
  if (!Number.isInteger(e.timestamp_ms) || e.timestamp_ms <= 0) throw new Error(`EVENT_${i}_TIMESTAMP_INVALID`);
  if (typeof e.pair !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(e.pair)) throw new Error(`EVENT_${i}_PAIR_INVALID`);
  for (const k of ['market_snapshot','jupiter_quote','liquidity','token_data','risk_engine','execution','pnl','position']) if (!e[k] || typeof e[k] !== 'object') throw new Error(`EVENT_${i}_${k}_MISSING`);
  for (const section of ['market_snapshot','jupiter_quote','liquidity','token_data','risk_engine','execution','pnl','position']) if (!['OBSERVED','DERIVED','MISSING'].includes(e[section].provenance)) throw new Error(`EVENT_${i}_${section}_PROVENANCE_INVALID`);
}
console.log(`Replay dataset contract OK: ${d.events.length} events; status=${d.status}`);
