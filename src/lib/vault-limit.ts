import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

// Best-effort single-admin rate limiter. Concurrent requests can race; for strong edge protection
// enable Netlify's platform rate limiting / WAF as well.
const store = () => getStore('pentestblueprint-vault-limits');
const keyFor = (ip: string) => 'login/' + createHash('sha256').update(ip).digest('hex');
export async function loginAllowed(ip: string): Promise<boolean> {
  const record = await store().get(keyFor(ip), { type: 'json' }) as { count: number; until: number } | null;
  return !record || record.until < Date.now() || record.count < 8;
}
export async function recordFailure(ip: string) {
  const key = keyFor(ip);
  const previous = await store().get(key, { type: 'json' }) as { count: number; until: number } | null;
  const fresh = !previous || previous.until < Date.now();
  await store().setJSON(key, { count: fresh ? 1 : previous.count + 1, until: fresh ? Date.now() + 15 * 60_000 : previous.until });
}
export async function clearFailures(ip: string) { await store().delete(keyFor(ip)); }
