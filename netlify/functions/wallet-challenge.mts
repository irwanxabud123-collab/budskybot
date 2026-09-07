import { challengeResponse } from '../../src/api/auth.js';
export default async function (req: Request) {
  if (req.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const nonce = crypto.randomUUID();
  const message = `Budsky Bot wallet authentication\nNonce: ${nonce}\nExpires: ${new Date(Date.now() + 5 * 60 * 1000).toISOString()}`;
  return challengeResponse(message);
}
