import type { APIRoute } from 'astro';
import { authorized, privateHeaders } from '../../../lib/vault-guard';
import { getEntry } from '../../../lib/vault-store';
export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  if (!(await authorized(request))) return new Response('Unauthorized', { status: 401, headers: privateHeaders });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Invalid id', { status: 400 });
  const entry = await getEntry(id);
  if (!entry) return new Response('Not found', { status: 404 });
  const bytes = entry.kind === 'attachment' ? Buffer.from(entry.content, 'base64') : Buffer.from(entry.content, 'utf8');
  const safeName = entry.path.split('/').pop()?.replace(/["\\\r\n]/g, '') || 'file';
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, 'Content-Type': entry.kind === 'markdown' ? 'text/plain; charset=utf-8' : entry.mime === 'image/svg+xml' ? 'application/octet-stream' : entry.mime, 'Content-Disposition': `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"`, 'Content-Security-Policy': "default-src 'none'; sandbox" } });
};
