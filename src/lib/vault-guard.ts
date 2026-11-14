import { COOKIE_NAME, validSession } from './vault-auth';

export async function authorized(request: Request): Promise<boolean> {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return validSession(token);
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin;
}
export const privateHeaders = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
