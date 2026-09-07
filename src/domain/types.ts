export type Mode = 'BACKTEST' | 'PAPER' | 'DRY_RUN' | 'LIVE';
export type Health = 'HEALTHY' | 'DEGRADED' | 'UNSAFE' | 'HALTED' | 'EMERGENCY';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type FeatureProvenance = 'OBSERVED' | 'DERIVED' | 'MISSING';
export type CalibrationStatus = 'CALIBRATED' | 'UNCALIBRATED' | 'INSUFFICIENT_DATA';
export type CalibrationSource = 'NONE' | 'BACKTEST_SEED' | 'PAPER_REPLAY' | 'LIVE_REPLAY';
export type DataQuality = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
export interface PositionContext { side: 'NONE' | 'LONG'; quantityRaw: bigint; entryPrice?: number | undefined; entryTimestamp?: number | undefined; unrealizedPnl?: number | undefined; }
export interface StrategyDecisionContext { nowMs?: number; candles?: Array<{timestampMs:number;open:number;high:number;low:number;close:number;volume:number}>; candlesByTimeframe?: Record<string, Array<{timestampMs:number;open:number;high:number;low:number;close:number;volume:number}>>; fundamental?: { provenance: FeatureProvenance; holderCount?:number; topHolderConcentrationPct?:number; liquidityUsd?:number; fdvUsd?:number; marketCapUsd?:number; mintAuthorityDisabled?:boolean; freezeAuthorityDisabled?:boolean; tokenAgeDays?:number; newsScore?:number; socialScore?:number; features?:Record<string,{value:number|boolean|string|null;source:string|null;timestampMs:number|null;provenance:FeatureProvenance}>; }; position?: PositionContext; calibrationModel?: { predict(raw:number):number }; calibrationSource?: CalibrationSource; sampleSize?: number; probabilityBaseRate?:number; regimeMultiplier?:number; riskAdjustment?:number; };
export type RiskDecision = 'APPROVE' | 'REJECT';
export type TxState =
  | 'CREATED' | 'VALIDATING' | 'QUOTE_REQUESTED' | 'QUOTE_RECEIVED' | 'QUOTE_VALIDATED'
  | 'TRANSACTION_BUILT' | 'SIMULATED' | 'SIGNING' | 'SIGNED' | 'SUBMITTED' | 'CONFIRMING'
  | 'CONFIRMED' | 'RECONCILED' | 'REJECTED' | 'EXPIRED' | 'SIMULATION_FAILED' | 'SIGNING_FAILED'
  | 'SUBMISSION_FAILED' | 'TIMEOUT' | 'CONFIRMATION_FAILED' | 'UNKNOWN';

export interface MarketSnapshot {
  inputMint: string; outputMint: string; inputAmountRaw: bigint; expectedOutputRaw: bigint;
  timestampMs: number; source: string; freshnessMs: number; valid: boolean;
  priceImpactPct: number; estimatedLiquidityUsd: number;
  entryPriceUsd?: number;
  candleFreshnessMs?: number;
  candles?: Array<{timestampMs:number;open:number;high:number;low:number;close:number;volume:number}>;
  featuresProvenance?: Record<string,FeatureProvenance>;
  fundamental?: StrategyDecisionContext['fundamental'];
}

export interface Signal {
  signalId: string; timestampMs: number; token: string; direction: SignalAction; disclaimer: string;
  entryReference: string | null; confidence: number | null; probability: number | null; rawProbability: number | null;
  calibrationStatus: CalibrationStatus; calibrationSource: CalibrationSource; taScore: number | null; faScore: number | null;
  marketQualityScore: number | null; riskScore: number | null; expectedValue: number | null;
  entryPrice: number | null; stopLoss: number | null; takeProfit: number | null; riskReward: number | null;
  strategyName: string; strategyVersion: string; modelVersion: string; calibrationVersion: string; featureVersion: string;
  reason: string; bullishReasons: string[]; bearishReasons: string[]; neutralReasons: string[];
  dataQuality: DataQuality; sampleSize: number; regime: string;
}

export interface RiskState {
  totalExposureUsd: number;
  tokenExposureUsd: number;
  dailyLossUsd: number;
  drawdownUsd: number;
  failedTrades: number;
  consecutiveLosses: number;
  lastTradeAtMs: number;
  requestedPositionUsd: number;
  walletUsdcUsd: number;
  walletSolLamports: bigint;
  riskStateFresh: boolean;
}


export interface RiskApproval { decision: RiskDecision; reason: string; checkedAtMs: number; }

export interface QuoteSummary {
  requestId?: string; inputMint: string; outputMint: string; inAmount: bigint; outAmount: bigint;
  minOutputAmount: bigint; slippageBps: number; priceImpactPct: number; timestampMs: number; raw: unknown;
}

export interface TransactionIntent {
  walletPublicKey: string;
  tradeId: string; signalId: string; inputMint: string; outputMint: string; inputAmountRaw: bigint;
  expectedOutputRaw: bigint; maxSlippageBps: number; timestampMs: number; riskApproved: boolean;
}

export interface TradeRecord {
  walletPublicKey: string;
  tradeId: string; signalId: string; executionId: string; state: TxState; createdAtMs: number;
  signature?: string; error?: string; quote?: QuoteSummary; transaction?: string; intent: TransactionIntent;
  requestId?: string; idempotencyKey?: string; realizedPnlUsd?: number; feeUsd?: number; notionalUsd?: number; executionSlippageBps?: number;
  positionId?: string; tradeSide?: 'ENTRY'|'EXIT'; positionQuantityRaw?: bigint;
}

export interface TransactionInspection {
  valid: boolean;
  reason: string;
  programIds: string[];
  accountKeys: string[];
}
