import { z } from 'zod';
const bool = (fallback) => z.string().optional().default(String(fallback)).transform(v => v.toLowerCase() === 'true');
const csv = z.string().optional().default('').transform(v => v.split(',').map(x => x.trim()).filter(Boolean));
const schema = z.object({
    MODE: z.enum(['BACKTEST', 'PAPER', 'DRY_RUN', 'LIVE']).default('DRY_RUN'),
    NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet', 'localnet']).default('mainnet-beta'),
    RPC_URL: z.string().url(),
    JUPITER_BASE_URL: z.string().url().default('https://api.jup.ag/swap/v2'),
    JUPITER_API_KEY: z.string().optional().default(''),
    SUPABASE_URL: z.string().url().optional().default(''),
    SUPABASE_KEY: z.string().optional().default(''),
    SUPABASE_SECRET_KEY: z.string().optional().default(''),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
    INPUT_MINT: z.string().min(32), OUTPUT_MINT: z.string().min(32),
    INPUT_DECIMALS: z.coerce.number().int().min(0).max(18), OUTPUT_DECIMALS: z.coerce.number().int().min(0).max(18),
    TRADE_AMOUNT: z.coerce.bigint().positive(),
    MAX_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(1000),
    MAX_PRICE_IMPACT_PCT: z.coerce.number().finite().min(0).max(10),
    MIN_LIQUIDITY_USD: z.coerce.number().positive(), MAX_POSITION_USD: z.coerce.number().positive(),
    MAX_TOKEN_EXPOSURE_USD: z.coerce.number().positive(), MAX_TOTAL_EXPOSURE_USD: z.coerce.number().positive(),
    MAX_DAILY_LOSS_USD: z.coerce.number().positive(), MAX_TRADE_LOSS_USD: z.coerce.number().positive(), MAX_DRAWDOWN_USD: z.coerce.number().positive(),
    MAX_PRIORITY_FEE_LAMPORTS: z.coerce.bigint().nonnegative(), MIN_SOL_RESERVE_LAMPORTS: z.coerce.bigint().positive(),
    MAX_FAILED_TRADES: z.coerce.number().int().positive(), MAX_CONSECUTIVE_LOSSES: z.coerce.number().int().positive(),
    TRADE_COOLDOWN_MS: z.coerce.number().int().nonnegative(), MAX_MARKET_DATA_AGE_MS: z.coerce.number().int().positive(), MAX_CANDLE_DATA_AGE_MS: z.coerce.number().int().positive().default(180000), MAX_QUOTE_AGE_MS: z.coerce.number().int().positive(),
    LIVE_ENABLED: bool(false), EMERGENCY_STOP: bool(false), WALLET_PUBLIC_KEY: z.string().optional().default(''),
    WALLET_SIGNING_MODE: z.literal('BROWSER').default('BROWSER'),
    ALLOWED_PROGRAM_IDS: csv, REQUIRE_TRANSACTION_INTENT_ALLOWLIST: bool(true), MAX_TRANSACTION_INSTRUCTIONS: z.coerce.number().int().positive().max(64).default(24), MAX_TRANSACTION_BYTES: z.coerce.number().int().positive().max(512000).default(256000),
    REQUIRE_SUPABASE: bool(true), RUNTIME_DIR: z.string().default('runtime'),
    API_AUTH_TOKEN: z.string().optional().default(''),
    LIVE_BROWSER_EXECUTION_ENABLED: bool(false),
    REPLAY_DATASET_PATH: z.string().optional().default(''),
    BACKTEST_SEED_PATH: z.string().optional().default('datasets/budsky-backtest-seed.json'),
    ALLOW_BACKTEST_SEED_LIVE: bool(false),
    ALLOW_PAPER_REPLAY_LIVE: bool(false),
    PAPER_REPLAY_MAX_POSITION_USD: z.coerce.number().positive().default(5),
    BACKTEST_SEED_MAX_POSITION_USD: z.coerce.number().positive().default(10),
    BLACKLISTED_MINTS: csv,
    REQUIRE_MINT_AUTHORITY_DISABLED: bool(true),
    REQUIRE_FREEZE_AUTHORITY_DISABLED: bool(true),
    ALLOW_TOKEN_2022: bool(false),
    WALLET_PATH: z.string().optional().default('WALLET_PAPER.json'),
    PAPER_MAINNET_TRADE_AMOUNT: z.coerce.bigint().positive().default(100000n),
}).superRefine((c, ctx) => {
    if (c.MAX_DAILY_LOSS_USD > c.MAX_DRAWDOWN_USD)
        ctx.addIssue({ code: 'custom', path: ['MAX_DAILY_LOSS_USD'], message: 'must not exceed MAX_DRAWDOWN_USD' });
    if (c.MAX_TOKEN_EXPOSURE_USD > c.MAX_TOTAL_EXPOSURE_USD)
        ctx.addIssue({ code: 'custom', path: ['MAX_TOKEN_EXPOSURE_USD'], message: 'must not exceed MAX_TOTAL_EXPOSURE_USD' });
    if (c.NETWORK === 'mainnet-beta' && !c.RPC_URL.startsWith('https://'))
        ctx.addIssue({ code: 'custom', path: ['RPC_URL'], message: 'mainnet RPC must use HTTPS' });
    if (c.MODE === 'LIVE' && !c.JUPITER_API_KEY)
        ctx.addIssue({ code: 'custom', path: ['JUPITER_API_KEY'], message: 'LIVE requires JUPITER_API_KEY' });
    if (c.MODE === 'LIVE' && !c.API_AUTH_TOKEN)
        ctx.addIssue({ code: 'custom', path: ['API_AUTH_TOKEN'], message: 'LIVE requires API_AUTH_TOKEN' });
    if (c.PAPER_REPLAY_MAX_POSITION_USD > c.MAX_POSITION_USD)
        ctx.addIssue({ code: 'custom', path: ['PAPER_REPLAY_MAX_POSITION_USD'], message: 'must not exceed MAX_POSITION_USD' });
    if (c.BACKTEST_SEED_MAX_POSITION_USD > c.MAX_POSITION_USD)
        ctx.addIssue({ code: 'custom', path: ['BACKTEST_SEED_MAX_POSITION_USD'], message: 'must not exceed MAX_POSITION_USD' });
    if (c.MODE === 'LIVE' && c.MAX_POSITION_USD > c.MAX_TOTAL_EXPOSURE_USD)
        ctx.addIssue({ code: 'custom', path: ['MAX_POSITION_USD'], message: 'must not exceed MAX_TOTAL_EXPOSURE_USD' });
    if (c.MODE === 'LIVE' && !c.LIVE_ENABLED)
        ctx.addIssue({ code: 'custom', path: ['LIVE_ENABLED'], message: 'LIVE requires LIVE_ENABLED=true' });
    if (c.MODE === 'LIVE' && c.EMERGENCY_STOP)
        ctx.addIssue({ code: 'custom', path: ['EMERGENCY_STOP'], message: 'emergency stop active' });
    if (c.MODE === 'LIVE' && c.WALLET_SIGNING_MODE === 'BROWSER' && !c.LIVE_BROWSER_EXECUTION_ENABLED)
        ctx.addIssue({ code: 'custom', path: ['LIVE_BROWSER_EXECUTION_ENABLED'], message: 'browser live execution requires an explicit enable flag' });
    if (c.MODE === 'LIVE' && c.REQUIRE_TRANSACTION_INTENT_ALLOWLIST && c.ALLOWED_PROGRAM_IDS.length === 0)
        ctx.addIssue({ code: 'custom', path: ['ALLOWED_PROGRAM_IDS'], message: 'live requires an explicit transaction program allowlist' });
    if (c.REQUIRE_SUPABASE && (!c.SUPABASE_URL || !(c.SUPABASE_KEY || c.SUPABASE_SECRET_KEY || c.SUPABASE_SERVICE_ROLE_KEY)))
        ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'Supabase persistence is required' });
});
export function loadConfig(env = process.env) { const c = schema.parse(env); return { ...c, mode: c.MODE }; }
