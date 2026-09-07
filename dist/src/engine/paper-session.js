import { makeReplayEvent } from '../replay/runtime-event.js';
import { id } from '../core/id.js';
export class PaperTradingSession {
    broker;
    logger;
    wallet;
    inputDecimals;
    outputDecimals;
    position = null;
    constructor(broker, logger, wallet, inputDecimals, outputDecimals) {
        this.broker = broker;
        this.logger = logger;
        this.wallet = wallet;
        this.inputDecimals = inputDecimals;
        this.outputDecimals = outputDecimals;
    }
    hasPosition() { return this.position !== null; }
    getPosition() { return this.position; }
    async apply(signal, market, quote) {
        if (signal.direction === 'BUY' && !this.position) {
            const tradeId = id('paper'), positionId = id('paper-pos');
            const trade = { walletPublicKey: this.wallet, tradeId, signalId: signal.signalId, executionId: id('paper-exec'), state: 'CONFIRMED', createdAtMs: Date.now(), intent: { walletPublicKey: this.wallet, tradeId, signalId: signal.signalId, inputMint: market.inputMint, outputMint: market.outputMint, inputAmountRaw: market.inputAmountRaw, expectedOutputRaw: market.expectedOutputRaw, maxSlippageBps: quote.slippageBps, timestampMs: market.timestampMs, riskApproved: true }, quote, positionId, tradeSide: 'ENTRY' };
            this.position = this.broker.open(positionId, signal, market, this.inputDecimals, this.outputDecimals);
            const feeUsd = this.position.entry.feeRaw === null ? null : Number(this.position.entry.feeRaw ?? 0) / Number(this.position.entry.inputAmountRaw) * this.position.entryNotionalUsd;
            await this.logger.record(makeReplayEvent({ trade, wallet: this.wallet, quote, eventType: 'POSITION_OPEN', side: 'BUY', success: true, executionLatencyMs: null, errorCode: null, actualSlippageBps: this.position.entry.slippageBps, feeUsd, feeLamports: null, context: { positionId, executionMode: 'PAPER_SIMULATED', strategy: strategyContext(signal), notionalUsd: this.position.entryNotionalUsd, grossPnlUsd: 0, netPnlUsd: feeUsd === null ? null : -feeUsd } }));
            return { action: 'OPEN', pnlUsd: null, tradeId };
        }
        if (signal.direction === 'SELL' && this.position) {
            const pos = this.position;
            const tradeId = id('paper'), trade = { walletPublicKey: this.wallet, tradeId, signalId: signal.signalId, executionId: id('paper-exec'), state: 'CONFIRMED', createdAtMs: Date.now(), intent: { walletPublicKey: this.wallet, tradeId, signalId: signal.signalId, inputMint: market.inputMint, outputMint: market.outputMint, inputAmountRaw: market.inputAmountRaw, expectedOutputRaw: market.expectedOutputRaw, maxSlippageBps: quote.slippageBps, timestampMs: market.timestampMs, riskApproved: true }, quote, positionId: pos.positionId, tradeSide: 'EXIT' };
            const closed = this.broker.close(pos, signal, market, this.outputDecimals, this.inputDecimals);
            await this.logger.record(makeReplayEvent({ trade, wallet: this.wallet, quote, eventType: 'POSITION_CLOSE', side: 'SELL', success: true, executionLatencyMs: null, errorCode: null, actualSlippageBps: closed.exit.slippageBps, feeUsd: closed.entryFeeUsd + closed.exitFeeUsd, feeLamports: null, context: { positionId: pos.positionId, executionMode: 'PAPER_SIMULATED', strategy: strategyContext(signal), notionalUsd: pos.entryNotionalUsd, grossPnlUsd: closed.grossPnlUsd, netPnlUsd: closed.netPnlUsd } }));
            this.position = null;
            return { action: 'CLOSE', pnlUsd: closed.netPnlUsd, tradeId };
        }
        return { action: 'HOLD', pnlUsd: null, tradeId: null };
    }
}
function strategyContext(s) { return { name: s.strategyName, version: s.strategyVersion, modelVersion: s.modelVersion, calibrationVersion: s.calibrationVersion, featureVersion: s.featureVersion, action: s.direction, signalId: s.signalId, probability: s.probability, rawProbability: s.rawProbability, calibrationStatus: s.calibrationStatus, calibrationSource: s.calibrationSource, taScore: s.taScore, faScore: s.faScore, marketQualityScore: s.marketQualityScore, riskScore: s.riskScore, expectedValue: s.expectedValue, entry: s.entryPrice, stopLoss: s.stopLoss, takeProfit: s.takeProfit, riskReward: s.riskReward, sampleSize: s.sampleSize, dataQuality: s.dataQuality, regime: s.regime, bullishReasons: s.bullishReasons, bearishReasons: s.bearishReasons, neutralReasons: s.neutralReasons }; }
