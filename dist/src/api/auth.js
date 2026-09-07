import { createHmac, timingSafeEqual } from 'node:crypto';
import nacl from 'tweetnacl';
const CHALLENGE_COOKIE = 'budsky_challenge';
const SESSION_COOKIE = 'budsky_session';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
function b64url(bytes) { return bytes.toString('base64url'); }
function fromB64url(v) { return Buffer.from(v, 'base64url'); }
function base58Decode(value) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes = [0];
    for (const ch of value) {
        const carry0 = alphabet.indexOf(ch);
        if (carry0 < 0)
            throw new Error('INVALID_BASE58');
        let carry = carry0;
        for (let i = 0; i < bytes.length; i++) {
            const n = bytes[i] * 58 + carry;
            bytes[i] = n & 255;
            carry = n >> 8;
        }
        while (carry) {
            bytes.push(carry & 255);
            carry >>= 8;
        }
    }
    let leading = 0;
    while (leading < value.length && value[leading] === '1')
        leading++;
    const out = Buffer.alloc(leading + bytes.length - (bytes.length > 1 && bytes[bytes.length - 1] === 0 ? 1 : 0));
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        if (v === undefined)
            throw new Error('BASE58_STATE');
        out[out.length - 1 - i] = v;
    }
    return out;
}
function cookies(req) {
    const out = {};
    for (const part of (req.headers.get('cookie') ?? '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0)
            out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}
function signSession(secret, wallet, expires) {
    const payload = `${wallet}.${expires}`;
    const mac = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${b64url(Buffer.from(payload))}.${mac}`;
}
function validSession(req, c, wallet) {
    if (!c.API_AUTH_TOKEN)
        return false;
    const value = cookies(req)[SESSION_COOKIE];
    if (!value)
        return false;
    const [payload64, mac] = value.split('.');
    if (!payload64 || !mac)
        return false;
    let payload;
    try {
        payload = fromB64url(payload64).toString();
    }
    catch {
        return false;
    }
    const parts = payload.split('.');
    const sessionWallet = parts[0];
    const expText = parts[1];
    if (typeof sessionWallet !== 'string' || typeof expText !== 'string')
        return false;
    const exp = Number(expText);
    if (!Number.isFinite(exp) || !Number.isSafeInteger(exp))
        return false;
    if (sessionWallet !== wallet || exp < Date.now())
        return false;
    const expected = createHmac('sha256', c.API_AUTH_TOKEN).update(payload).digest('base64url');
    try {
        return timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
    }
    catch {
        return false;
    }
}
export function authorized(req, c, wallet) {
    if (c.MODE !== 'LIVE')
        return !c.API_AUTH_TOKEN || req.headers.get('authorization') === `Bearer ${c.API_AUTH_TOKEN}`;
    if (!wallet)
        return false;
    return validSession(req, c, wallet);
}
// Control-plane mutations always require the wallet-authenticated session, regardless of operational mode.
export function walletSessionAuthorized(req, c, wallet) { return validSession(req, c, wallet); }
export function challengeResponse(message) {
    const cookie = `${CHALLENGE_COOKIE}=${encodeURIComponent(message)}; Max-Age=${Math.floor(CHALLENGE_TTL_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
    return new Response(JSON.stringify({ message }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': cookie } });
}
export function verifyWalletMessage(wallet, message, signatureBase58) {
    try {
        const pub = base58Decode(wallet);
        const sig = base58Decode(signatureBase58);
        if (pub.length !== 32 || sig.length !== 64 || message.length < 20)
            return false;
        return nacl.sign.detached.verify(new TextEncoder().encode(message), new Uint8Array(sig), new Uint8Array(pub));
    }
    catch {
        return false;
    }
}
export function issueSession(req, c, wallet, message) {
    if (!c.API_AUTH_TOKEN)
        return null;
    const expected = cookies(req)[CHALLENGE_COOKIE];
    if (!expected || expected !== message)
        return null;
    const expires = Date.now() + SESSION_TTL_MS;
    const value = signSession(c.API_AUTH_TOKEN, wallet, expires);
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
    const response = new Response(JSON.stringify({ authenticated: true, wallet, expiresAtMs: expires }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    response.headers.append('set-cookie', `${CHALLENGE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`);
    response.headers.append('set-cookie', cookie);
    return response;
}
export function base58Encode(value) {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (value.length === 0)
        return '';
    const digits = [0];
    for (const byte of value) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
            const n = digits[i] * 256 + carry;
            digits[i] = n % 58;
            carry = Math.floor(n / 58);
        }
        while (carry) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let out = '';
    for (const byte of value) {
        if (byte !== 0)
            break;
        out += '1';
    }
    for (let i = digits.length - 1; i >= 0; i--)
        out += alphabet[digits[i]];
    return out;
}
export const challengeTtlMs = CHALLENGE_TTL_MS;
