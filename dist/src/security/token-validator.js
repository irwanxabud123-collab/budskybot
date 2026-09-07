import { PublicKey } from '@solana/web3.js';
export async function validateMint(connection, mint) {
    let pk;
    try {
        pk = new PublicKey(mint);
    }
    catch {
        return { valid: false, mint, decimals: 0, owner: '', reason: 'INVALID_MINT_ADDRESS' };
    }
    const info = await connection.getParsedAccountInfo(pk, 'confirmed');
    if (!info.value)
        return { valid: false, mint, decimals: 0, owner: '', reason: 'MINT_ACCOUNT_NOT_FOUND' };
    const owner = info.value.owner.toBase58();
    const data = info.value.data;
    if (typeof data !== 'object' || !('parsed' in data))
        return { valid: false, mint, decimals: 0, owner, reason: 'MINT_DATA_NOT_PARSED' };
    const parsed = data.parsed;
    const decimals = parsed?.info?.decimals;
    if (typeof decimals !== 'number')
        return { valid: false, mint, decimals: 0, owner, reason: 'DECIMALS_UNAVAILABLE' };
    const mintAuthorityDisabled = (parsed?.info?.mintAuthority ?? null) === null;
    const freezeAuthorityDisabled = (parsed?.info?.freezeAuthority ?? null) === null;
    return { valid: true, mint, decimals, owner, reason: 'VALIDATED', mintAuthorityDisabled, freezeAuthorityDisabled };
}
