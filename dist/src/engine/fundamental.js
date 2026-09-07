import { PublicKey } from '@solana/web3.js';
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu7');
export async function collectFundamentals(connection, mint, market = {}) {
    const now = Date.now(), pk = new PublicKey(mint);
    const info = await connection.getParsedAccountInfo(pk, 'confirmed');
    const parsed = info.value?.data?.parsed?.info;
    const mintAuthority = parsed?.mintAuthority ?? null, freezeAuthority = parsed?.freezeAuthority ?? null;
    const supply = await connection.getTokenSupply(pk, 'confirmed');
    const largest = await connection.getTokenLargestAccounts(pk, 'confirmed');
    const supplyRaw = BigInt(supply.value.amount);
    const topConcentration = supplyRaw > 0n ? Number(largest.value.slice(0, 10).reduce((a, x) => a + BigInt(x.amount), 0n) * 10000n / supplyRaw) / 100 : null;
    const features = { mintAuthorityDisabled: { value: mintAuthority === null, source: 'Solana RPC getParsedAccountInfo', timestampMs: now, provenance: 'OBSERVED' }, freezeAuthorityDisabled: { value: freezeAuthority === null, source: 'Solana RPC getParsedAccountInfo', timestampMs: now, provenance: 'OBSERVED' }, supply: { value: Number(supply.value.amount) / 10 ** supply.value.decimals, source: 'Solana RPC getTokenSupply', timestampMs: now, provenance: 'OBSERVED' }, holderCount: { value: null, source: null, timestampMs: null, provenance: 'MISSING' }, topHolderConcentrationPct: { value: topConcentration, source: 'Solana RPC getTokenLargestAccounts', timestampMs: now, provenance: topConcentration === null ? 'MISSING' : 'DERIVED' } };
    return { provenance: 'OBSERVED', features, ...(topConcentration !== null ? { topHolderConcentrationPct: topConcentration } : {}), ...(market.liquidityUsd !== null && market.liquidityUsd !== undefined ? { liquidityUsd: market.liquidityUsd } : {}), ...(market.fdvUsd !== null && market.fdvUsd !== undefined ? { fdvUsd: market.fdvUsd } : {}), ...(market.marketCapUsd !== null && market.marketCapUsd !== undefined ? { marketCapUsd: market.marketCapUsd } : {}), mintAuthorityDisabled: mintAuthority === null, freezeAuthorityDisabled: freezeAuthority === null };
}
export { TOKEN_PROGRAM, TOKEN_2022 };
