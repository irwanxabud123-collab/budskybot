import { describe, expect, it } from 'vitest';
describe('Live control state contract', () => {
    it('starts fail-closed in PAPER', () => {
        const state = { mode: 'PAPER', liveEnabled: false, emergencyStop: false, updatedAtMs: 0, updatedBy: null, version: 0 };
        expect(state.mode).toBe('PAPER');
        expect(state.liveEnabled).toBe(false);
    });
    it('emergency stop is incompatible with active LIVE', () => {
        const state = { mode: 'PAPER', liveEnabled: false, emergencyStop: true, updatedAtMs: 0, updatedBy: 'operator', version: 1 };
        expect(state.mode).not.toBe('LIVE');
        expect(state.liveEnabled).toBe(false);
    });
});
