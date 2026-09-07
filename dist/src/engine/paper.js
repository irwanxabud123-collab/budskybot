/** PAPER only: quotes are real, signing/broadcasting never occurs. */
export class PaperBroker {
    observedModel;
    fills = [];
    constructor(observedModel) {
        this.observedModel = observedModel;
    }
    fill(signal, m) {
        if (!m.valid || m.expectedOutputRaw <= 0n)
            throw new Error('PAPER_MARKET_SNAPSHOT_INVALID');
        const model = this.observedModel;
        const feeRaw = model ? m.inputAmountRaw * BigInt(Math.round(model.feeBps)) / 10000n : null;
        const slipRaw = model ? m.expectedOutputRaw * BigInt(Math.round(model.slippageBps)) / 10000n : 0n;
        if (slipRaw >= m.expectedOutputRaw)
            throw new Error('PAPER_SLIPPAGE_EXCEEDS_QUOTE');
        const f = { signalId: signal.signalId, inputAmountRaw: m.inputAmountRaw, outputAmountRaw: m.expectedOutputRaw - slipRaw, feeRaw, slippageBps: model?.slippageBps ?? null, timestampMs: m.timestampMs, source: model ? 'OBSERVED_EXECUTION_MODEL' : 'JUPITER_QUOTE' };
        this.fills.push(f);
        return f;
    }
    open(positionId, signal, m, inputDecimals, outputDecimals) {
        const entry = this.fill(signal, m);
        const notionalUsd = m.inputMint === USDC_MINT ? units(entry.inputAmountRaw, inputDecimals) : m.entryPriceUsd !== undefined ? Number(units(entry.inputAmountRaw, inputDecimals)) * m.entryPriceUsd : NaN;
        if (!Number.isFinite(notionalUsd) || notionalUsd <= 0)
            throw new Error('PAPER_USD_VALUE_UNAVAILABLE');
        return { positionId, entry, entryInputMint: m.inputMint, entryOutputMint: m.outputMint, entryInputDecimals: inputDecimals, entryOutputDecimals: outputDecimals, entryNotionalUsd: notionalUsd };
    }
    close(position, signal, m, inputDecimals, outputDecimals) {
        if (m.inputMint !== position.entryOutputMint || m.outputMint !== position.entryInputMint)
            throw new Error('PAPER_CLOSE_PAIR_MISMATCH');
        if (m.inputAmountRaw !== position.entry.outputAmountRaw)
            throw new Error('PAPER_CLOSE_QUANTITY_MISMATCH');
        const exit = this.fill(signal, m);
        const exitNotionalUsd = m.outputMint === USDC_MINT ? units(exit.outputAmountRaw, outputDecimals) : m.entryPriceUsd !== undefined ? Number(units(exit.outputAmountRaw, outputDecimals)) * m.entryPriceUsd : NaN;
        if (!Number.isFinite(exitNotionalUsd))
            throw new Error('PAPER_USD_VALUE_UNAVAILABLE');
        const grossPnlUsd = exitNotionalUsd - position.entryNotionalUsd;
        const entryFeeUsd = position.entry.feeRaw === null ? 0 : feeToUsd(position.entry.feeRaw, position.entry.inputAmountRaw, position.entryNotionalUsd);
        const exitFeeUsd = exit.feeRaw === null ? 0 : feeToUsd(exit.feeRaw, exit.inputAmountRaw, exitNotionalUsd);
        const netPnlUsd = grossPnlUsd - entryFeeUsd - exitFeeUsd;
        return { position, exit, grossPnlUsd, netPnlUsd, exitNotionalUsd, entryFeeUsd, exitFeeUsd };
    }
    all() { return [...this.fills]; }
}
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
function units(raw, decimals) { return Number(raw) / 10 ** decimals; }
function feeToUsd(feeRaw, inputRaw, inputUsd) { return inputRaw > 0n ? Number(feeRaw) / Number(inputRaw) * inputUsd : 0; }
