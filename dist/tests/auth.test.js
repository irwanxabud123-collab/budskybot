import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyWalletMessage } from '../src/api/auth.js';
function b58(bytes) {
    const a = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let d = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < d.length; i++) {
            const digit = d[i];
            if (digit === undefined)
                throw new Error('BASE58_STATE');
            const n = digit * 256 + carry;
            d[i] = n % 58;
            carry = Math.floor(n / 58);
        }
        while (carry) {
            d.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte !== 0)
            break;
        out += '1';
    }
    for (let i = d.length - 1; i >= 0; i--) {
        const digit = d[i];
        if (digit === undefined)
            throw new Error('BASE58_STATE');
        const symbol = a[digit];
        if (symbol === undefined)
            throw new Error('BASE58_DIGIT');
        out += symbol;
    }
    return out;
}
describe('wallet message verification', () => {
    it('verifies an Ed25519 wallet signature', () => {
        const { publicKey, privateKey } = generateKeyPairSync('ed25519');
        const der = publicKey.export({ format: 'der', type: 'spki' });
        const wallet = b58(der.subarray(-32));
        const message = 'Budsky Bot wallet authentication\nNonce: test\nExpires: 2099-01-01T00:00:00.000Z';
        const signature = sign(null, Buffer.from(message), privateKey);
        expect(verifyWalletMessage(wallet, message, b58(signature))).toBe(true);
        expect(verifyWalletMessage(wallet, message + 'x', b58(signature))).toBe(false);
    });
});
