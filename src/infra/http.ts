import { randomInt } from 'node:crypto';
import { ClassifiedError, classifyHttp } from '../core/errors.js';
export async function fetchJson<T>(url: string, init: RequestInit, timeoutMs = 8000, retries = 2): Promise<T> {
  let last: unknown;
  for (let attempt=0; attempt<=retries; attempt++) {
    const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {...init, signal: controller.signal});
      const text = await r.text();
      if (!r.ok) throw new ClassifiedError(`HTTP ${r.status}: ${text.slice(0,500)}`, classifyHttp(r.status));
      try { return JSON.parse(text) as T; } catch { throw new ClassifiedError('Malformed JSON response','NON_RETRYABLE'); }
    } catch (e) {
      last = e;
      const retryable = e instanceof ClassifiedError ? e.classification === 'RETRYABLE' : e instanceof DOMException && e.name === 'AbortError';
      if (!retryable || attempt === retries) throw e;
      await new Promise(r=>setTimeout(r, Math.min(1000 * 2**attempt + randomInt(0, 250), 4000)));
    } finally { clearTimeout(timer); }
  }
  throw last;
}
