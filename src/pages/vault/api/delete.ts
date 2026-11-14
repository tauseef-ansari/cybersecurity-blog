import type { APIRoute } from 'astro';
import { authorized, sameOrigin, privateHeaders } from '../../../lib/vault-guard';
import { deleteEntry } from '../../../lib/vault-store';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (!(await authorized(request))) return new Response('Unauthorized', { status: 401, headers: privateHeaders });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: privateHeaders });
  const body = await request.formData();
  const id = String(body.get('id') || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Invalid id', { status: 400 });
  await deleteEntry(id);
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/vault' } });
};
