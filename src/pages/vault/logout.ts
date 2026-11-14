import type { APIRoute } from 'astro';
import { COOKIE_NAME, revokeSession } from '../../lib/vault-auth';
import { sameOrigin, privateHeaders } from '../../lib/vault-guard';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  await revokeSession(cookies.get(COOKIE_NAME)?.value);
  cookies.delete(COOKIE_NAME, { path: '/vault' });
  return redirect('/vault/login', 303);
};
