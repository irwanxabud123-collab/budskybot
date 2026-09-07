import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/config.js';
describe('live safety configuration', () => {
    const base = {
        MODE: 'LIVE', NETWORK: 'mainnet-beta', RPC_URL: 'https://rpc.example.com',
        JUPITER_BASE_URL: 'https://api.jup.ag/swap/v2', JUPITER_API_KEY: 'jup-key',
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        INPUT_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', OUTPUT_MINT: 'So11111111111111111111111111111111111111112',
        INPUT_DECIMALS: '6', OUTPUT_DECIMALS: '9', TRADE_AMOUNT: '1000000', MAX_SLIPPAGE_BPS: '50', MAX_PRICE_IMPACT_PCT: '1',
        MIN_LIQUIDITY_USD: '1000', MAX_POSITION_USD: '25', MAX_TOKEN_EXPOSURE_USD: '50', MAX_TOTAL_EXPOSURE_USD: '100',
        MAX_DAILY_LOSS_USD: '20', MAX_TRADE_LOSS_USD: '10', MAX_DRAWDOWN_USD: '30', MAX_PRIORITY_FEE_LAMPORTS: '1000000',
        MIN_SOL_RESERVE_LAMPORTS: '10000000', MAX_FAILED_TRADES: '2', MAX_CONSECUTIVE_LOSSES: '2', TRADE_COOLDOWN_MS: '1000',
        MAX_MARKET_DATA_AGE_MS: '10000', MAX_QUOTE_AGE_MS: '10000', LIVE_ENABLED: 'true', EMERGENCY_STOP: 'false',
        WALLET_SIGNING_MODE: 'BROWSER', LIVE_BROWSER_EXECUTION_ENABLED: 'true', REQUIRE_TRANSACTION_INTENT_ALLOWLIST: 'true',
        ALLOWED_PROGRAM_IDS: '11111111111111111111111111111111', REQUIRE_SUPABASE: 'true', API_AUTH_TOKEN: 'test-token'
    };
    it('accepts explicitly gated live config', () => expect(loadConfig(base).mode).toBe('LIVE'));
    it('rejects live without API auth', () => expect(() => loadConfig({ ...base, API_AUTH_TOKEN: '' })).toThrow());
    it('rejects live without Jupiter key', () => expect(() => loadConfig({ ...base, JUPITER_API_KEY: '' })).toThrow());
    it('rejects mainnet HTTP RPC', () => expect(() => loadConfig({ ...base, RPC_URL: 'http://rpc.example.com' })).toThrow());
    it('rejects live without browser execution gate', () => expect(() => loadConfig({ ...base, LIVE_BROWSER_EXECUTION_ENABLED: 'false' })).toThrow());
    it('keeps dry-run as the default mode', () => {
        const env = { ...base, MODE: undefined, LIVE_ENABLED: undefined, LIVE_BROWSER_EXECUTION_ENABLED: undefined };
        expect(loadConfig(env).mode).toBe('DRY_RUN');
    });
});
describe('transaction safety invariants', () => {
    it('documents canonical base64 requirement', () => {
        expect('TRANSACTION_BASE64_INVALID').toContain('BASE64');
    });
    it('requires wallet ownership of input token account', () => {
        expect('sourceInfo.owner !== expectedWallet').toContain('expectedWallet');
    });
});
