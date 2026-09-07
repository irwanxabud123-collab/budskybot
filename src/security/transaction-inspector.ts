import { AddressLookupTableAccount, Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { Config } from '../config/config.js';
import type { TransactionInspection } from '../domain/types.js';

const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu7',
]);


function u64le(bytes: Uint8Array): bigint {
  if (bytes.length < 8) throw new Error('INVALID_U64');
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    const byte = bytes[i];
    if (byte === undefined) throw new Error('INVALID_U64');
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

interface ParsedTokenAccountInfo { owner?: string; mint?: string; }

async function accountOwnerAndMint(connection: Connection, key: PublicKey): Promise<ParsedTokenAccountInfo> {
  const info = await connection.getParsedAccountInfo(key, { commitment: 'confirmed' });
  const data = info.value?.data;
  if (!data || typeof data !== 'object' || !('parsed' in data)) return {};
  const parsed = data.parsed;
  if (!parsed || typeof parsed !== 'object' || !('info' in parsed)) return {};
  const tokenInfo = parsed.info;
  if (!tokenInfo || typeof tokenInfo !== 'object') return {};
  const owner = 'owner' in tokenInfo && typeof tokenInfo.owner === 'string' ? tokenInfo.owner : undefined;
  const mint = 'mint' in tokenInfo && typeof tokenInfo.mint === 'string' ? tokenInfo.mint : undefined;
  return { owner, mint };
}

export async function inspectTransaction(
  connection: Connection,
  base64: string,
  c: Config,
  expectedInputMint = c.INPUT_MINT,
  expectedOutputMint = c.OUTPUT_MINT,
  expectedWallet?: string,
  expectedInputAmountRaw?: bigint,
  expectedMinOutputAmountRaw?: bigint,
): Promise<TransactionInspection> {
  let tx: VersionedTransaction;
  let rawBytes: Buffer;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) return { valid: false, reason: 'TRANSACTION_BASE64_INVALID', programIds: [], accountKeys: [] };
  try {
    rawBytes = Buffer.from(base64, 'base64');
    if (rawBytes.length === 0 || rawBytes.toString('base64') !== base64) return { valid: false, reason: 'TRANSACTION_BASE64_INVALID', programIds: [], accountKeys: [] };
  } catch { return { valid: false, reason: 'TRANSACTION_BASE64_INVALID', programIds: [], accountKeys: [] }; }
  if (rawBytes.length === 0 || rawBytes.length > c.MAX_TRANSACTION_BYTES) return { valid: false, reason: 'TRANSACTION_SIZE_INVALID', programIds: [], accountKeys: [] };
  try { tx = VersionedTransaction.deserialize(rawBytes); }
  catch { return { valid: false, reason: 'TRANSACTION_DESERIALIZATION_FAILED', programIds: [], accountKeys: [] }; }

  const staticKeys = tx.message.staticAccountKeys;
  const lookupAccounts: AddressLookupTableAccount[] = [];
  for (const lookup of tx.message.addressTableLookups) {
    const r = await connection.getAddressLookupTable(lookup.accountKey, { commitment: 'confirmed' });
    if (!r.value) return { valid: false, reason: `LOOKUP_TABLE_NOT_FOUND:${lookup.accountKey.toBase58()}`, programIds: [], accountKeys: [] };
    lookupAccounts.push(r.value);
  }
  const resolved = [...staticKeys];
  for (const l of tx.message.addressTableLookups) {
    const a = lookupAccounts.find(x => x.key.equals(l.accountKey));
    if (!a) return { valid: false, reason: 'LOOKUP_TABLE_RESOLUTION_FAILED', programIds: [], accountKeys: [] };
    for (const i of l.writableIndexes) {
      const address = a.state.addresses[i];
      if (!address) return { valid: false, reason: 'LOOKUP_WRITABLE_INDEX_INVALID', programIds: [], accountKeys: [] };
      resolved.push(address);
    }
    for (const i of l.readonlyIndexes) {
      const address = a.state.addresses[i];
      if (!address) return { valid: false, reason: 'LOOKUP_READONLY_INDEX_INVALID', programIds: [], accountKeys: [] };
      resolved.push(address);
    }
  }

  const programIds = tx.message.compiledInstructions
    .map(i => resolved[i.programIdIndex]?.toBase58())
    .filter((x): x is string => Boolean(x));
  for (const instruction of tx.message.compiledInstructions) {
    const programId = resolved[instruction.programIdIndex]?.toBase58();
    if (programId !== COMPUTE_BUDGET_PROGRAM) continue;
    const data = instruction.data;
    const opcode = data[0];
    if (opcode === 3) {
      if (data.length < 9) return { valid: false, reason: 'INVALID_COMPUTE_BUDGET_INSTRUCTION', programIds, accountKeys: [] };
      const microLamports = u64le(data.slice(1, 9));
      const estimatedUnits = 1_400_000n;
      const estimatedPriorityFee = (microLamports * estimatedUnits + 999_999n) / 1_000_000n;
      if (estimatedPriorityFee > c.MAX_PRIORITY_FEE_LAMPORTS) return { valid: false, reason: 'MAX_PRIORITY_FEE_EXCEEDED', programIds, accountKeys: [] };
    } else if (opcode !== 2 && opcode !== undefined) {
      return { valid: false, reason: 'UNSUPPORTED_COMPUTE_BUDGET_INSTRUCTION', programIds, accountKeys: [] };
    }
  }
  const accountKeys = resolved.map(x => x.toBase58());
  if (!programIds.length) return { valid: false, reason: 'NO_PROGRAM_INSTRUCTIONS', programIds, accountKeys };
  if (tx.message.compiledInstructions.length > c.MAX_TRANSACTION_INSTRUCTIONS) return { valid: false, reason: 'TOO_MANY_INSTRUCTIONS', programIds, accountKeys };
  if (c.REQUIRE_TRANSACTION_INTENT_ALLOWLIST && programIds.some(p => !c.ALLOWED_PROGRAM_IDS.includes(p))) return { valid: false, reason: 'PROGRAM_NOT_ALLOWLISTED', programIds, accountKeys };
  if (!accountKeys.includes(expectedInputMint) || !accountKeys.includes(expectedOutputMint)) return { valid: false, reason: 'EXPECTED_MINT_NOT_PRESENT_IN_TRANSACTION', programIds, accountKeys };
  if (expectedWallet && !accountKeys.includes(expectedWallet)) return { valid: false, reason: 'EXPECTED_WALLET_NOT_PRESENT', programIds, accountKeys };
  if (expectedWallet && staticKeys[0]?.toBase58() !== expectedWallet) return { valid: false, reason: 'FEE_PAYER_MISMATCH', programIds, accountKeys };

  if (expectedWallet && expectedInputAmountRaw !== undefined) {
    let inputTransferVerified = false;
    for (const instruction of tx.message.compiledInstructions) {
      const programId = resolved[instruction.programIdIndex]?.toBase58();
      if (!programId || !TOKEN_PROGRAMS.has(programId)) continue;
      const data = instruction.data;
      const opcode = data[0];
      if (data.length < 9 || (opcode !== 3 && opcode !== 12)) continue;
      const sourceIndex = instruction.accountKeyIndexes[0];
      const mintIndex = opcode === 12 ? instruction.accountKeyIndexes[1] : undefined;
      const authorityIndex = opcode === 12 ? instruction.accountKeyIndexes[3] : instruction.accountKeyIndexes[2];
      const source = sourceIndex === undefined ? undefined : resolved[sourceIndex];
      const authority = authorityIndex === undefined ? undefined : resolved[authorityIndex];
      if (!source || !authority || authority.toBase58() !== expectedWallet) continue;
      const sourceInfo = await accountOwnerAndMint(connection, source);
      if (sourceInfo.owner !== expectedWallet) continue;
      const mint = mintIndex === undefined ? sourceInfo.mint : resolved[mintIndex]?.toBase58();
      if (mint !== expectedInputMint) continue;
      const amount = u64le(data.slice(1, 9));
      if (amount === expectedInputAmountRaw) { inputTransferVerified = true; break; }
    }
    if (!inputTransferVerified) return { valid: false, reason: 'INPUT_TRANSFER_INTENT_MISMATCH', programIds, accountKeys };

    if (expectedMinOutputAmountRaw !== undefined) {
      let outputTransferVerified = false;
      for (const instruction of tx.message.compiledInstructions) {
        const programId = resolved[instruction.programIdIndex]?.toBase58();
        if (!programId || !TOKEN_PROGRAMS.has(programId)) continue;
        const data = instruction.data;
        const opcode = data[0];
        if (data.length < 9 || (opcode !== 3 && opcode !== 12)) continue;
        const destinationIndex = opcode === 12 ? instruction.accountKeyIndexes[2] : instruction.accountKeyIndexes[1];
        const mintIndex = opcode === 12 ? instruction.accountKeyIndexes[1] : undefined;
        const destination = destinationIndex === undefined ? undefined : resolved[destinationIndex];
        if (!destination) continue;
        const destinationInfo = await accountOwnerAndMint(connection, destination);
        const mint = mintIndex === undefined ? destinationInfo.mint : resolved[mintIndex]?.toBase58();
        if (mint !== expectedOutputMint || destinationInfo.owner !== expectedWallet) continue;
        const amount = u64le(data.slice(1, 9));
        if (amount >= expectedMinOutputAmountRaw) { outputTransferVerified = true; break; }
      }
      if (!outputTransferVerified) return { valid: false, reason: 'OUTPUT_TRANSFER_INTENT_MISMATCH', programIds, accountKeys };
    }
  }

  return { valid: true, reason: 'TRANSACTION_INTENT_ALLOWLIST_AND_IO_INTENT_VALID', programIds, accountKeys };
}
