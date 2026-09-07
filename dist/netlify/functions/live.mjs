import { loadConfig } from '../../src/config/config.js';
export default async function (req) {
    if (req.method !== 'POST')
        return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    try {
        loadConfig();
    }
    catch (e) {
        return Response.json({ error: 'config_invalid', detail: e instanceof Error ? e.message : 'unknown' }, { status: 503 });
    }
    // The legacy server-side execution route is intentionally disabled. Browser
    // wallet execution is the only supported LIVE path until a non-exportable
    // KMS/HSM signing service is integrated and independently reviewed.
    return Response.json({ error: 'server_signing_disabled_kms_hsm_required' }, { status: 409 });
}
