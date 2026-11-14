import type { APIRoute } from 'astro';
import { unzipSync, strFromU8 } from 'fflate';
import { authorized, sameOrigin, privateHeaders } from '../../../lib/vault-guard';
import { saveEntries } from '../../../lib/vault-store';
export const prerender = false;
const MAX_UPLOAD = 8 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const MAX_ENTRY = 3 * 1024 * 1024;
const MAX_FILES = 200;
const isText = (path: string) => /\.(md|markdown|txt)$/i.test(path);
const safePath = (path: string) => {
  const normalized = path.replaceAll('\\', '/').normalize('NFC');
  if (normalized.startsWith('/') || normalized.split('/').some(x => x === '..' || x === '.' || x.startsWith('__MACOSX'))) return null;
  return normalized.replace(/[\u0000-\u001f]/g, '').slice(0, 500);
};
const allowedAttachment = (p: string) => /\.(png|jpe?g|gif|webp|pdf|svg)$/i.test(p);
const mime = (p: string) => ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',svg:'image/svg+xml'} as Record<string,string>)[p.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';
export const POST: APIRoute = async ({ request }) => {
  if (!(await authorized(request))) return new Response('Unauthorized', { status: 401, headers: privateHeaders });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: privateHeaders });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_UPLOAD + 500_000) return new Response('Upload too large', { status: 413 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size > MAX_UPLOAD) return new Response('Choose a file smaller than 8 MB', { status: 400 });
  const buffer = new Uint8Array(await file.arrayBuffer());
  const items: {path:string;content:string;kind:'markdown'|'attachment';mime:string;size:number}[] = [];
  if (/\.zip$/i.test(file.name)) {
    let entries: Record<string, Uint8Array>;
    try {
      let expanded = 0;
      let count = 0;
      entries = unzipSync(buffer, { filter: info => {
        count++;
        expanded += info.originalSize;
        if (count > MAX_FILES || expanded > MAX_TOTAL || info.originalSize > MAX_ENTRY) return false;
        return true;
      }});
      if (count > MAX_FILES || expanded > MAX_TOTAL) return new Response('ZIP exceeds limits', { status: 413 });
    } catch { return new Response('Invalid ZIP archive', { status: 400 }); }
    let total = 0;
    const files = Object.entries(entries).filter(([name]) => !name.endsWith('/'));
    if (files.length > MAX_FILES) return new Response('Too many files (max 200)', { status: 400 });
    for (const [name, bytes] of files) {
      total += bytes.length;
      if (total > MAX_TOTAL) return new Response('ZIP expands beyond 25 MB', { status: 413 });
      const path = safePath(name);
      if (!path || (!isText(path) && !allowedAttachment(path)) || bytes.length > MAX_ENTRY) continue;
      items.push({ path, content: isText(path) ? strFromU8(bytes) : Buffer.from(bytes).toString('base64'), kind: isText(path) ? 'markdown' : 'attachment', mime: isText(path) ? 'text/plain' : mime(path), size: bytes.length });
    }
  } else {
    const path = safePath(file.name);
    if (!path || !isText(path) || file.size > MAX_ENTRY) return new Response('Upload a Markdown or text file, or a Notion ZIP', { status: 400 });
    items.push({path,content:strFromU8(buffer),kind:'markdown',mime:'text/plain',size:file.size});
  }
  if (!items.length) return new Response('No supported notes or attachments found', { status: 400 });
  try {
    const count = await saveEntries(items);
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: `/vault?imported=${count}` } });
  } catch { return new Response('Storage failed. Check Netlify Blobs configuration.', { status: 500, headers: privateHeaders }); }
};
