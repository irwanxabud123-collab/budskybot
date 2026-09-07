const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxu7';
export async function evaluateTokenPolicy(connection, validation, config) {
    if (!validation.valid)
        return { allowed: false, reason: 'TOKEN_VALIDATION_FAILED', mintAuthorityDisabled: null, freezeAuthorityDisabled: null, token2022: false };
    if (config.blacklist.has(validation.mint))
        return { allowed: false, reason: 'TOKEN_BLACKLISTED', mintAuthorityDisabled: validation.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: validation.freezeAuthorityDisabled ?? null, token2022: validation.owner === TOKEN_2022 };
    const token2022 = validation.owner === TOKEN_2022;
    if (token2022 && !config.allowToken2022)
        return { allowed: false, reason: 'TOKEN_2022_BLOCKED', mintAuthorityDisabled: validation.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: validation.freezeAuthorityDisabled ?? null, token2022 };
    if (config.requireMintAuthorityDisabled && validation.mintAuthorityDisabled !== true)
        return { allowed: false, reason: 'MINT_AUTHORITY_HARD_BLOCK', mintAuthorityDisabled: validation.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: validation.freezeAuthorityDisabled ?? null, token2022 };
    if (config.requireFreezeAuthorityDisabled && validation.freezeAuthorityDisabled !== true)
        return { allowed: false, reason: 'FREEZE_AUTHORITY_HARD_BLOCK', mintAuthorityDisabled: validation.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: validation.freezeAuthorityDisabled ?? null, token2022 };
    return { allowed: true, reason: 'TOKEN_POLICY_ALLOWED', mintAuthorityDisabled: validation.mintAuthorityDisabled ?? null, freezeAuthorityDisabled: validation.freezeAuthorityDisabled ?? null, token2022 };
}
export const defaultTokenPolicy = (blacklisted) => ({ blacklist: new Set(blacklisted), requireMintAuthorityDisabled: true, requireFreezeAuthorityDisabled: true, allowToken2022: false });
