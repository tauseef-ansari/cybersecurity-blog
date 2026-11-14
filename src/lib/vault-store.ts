import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';

const store = () => getStore('pentestblueprint-private-vault');
export type Entry = { id: string; path: string; kind: 'markdown' | 'attachment'; size: number; created: string };
const indexKey = 'library-index-v1';

export async function listEntries(): Promise<Entry[]> {
  return (await store().get(indexKey, { type: 'json' }) as Entry[] | null) ?? [];
}
export async function getEntry(id: string) {
  const entry = (await listEntries()).find(e => e.id === id);
  if (!entry) return null;
  const data = await store().get(`entry/${id}`, { type: 'json' }) as { content: string; mime: string } | null;
  return data ? { ...entry, ...data } : null;
}
export async function saveEntries(items: { path: string; content: string; kind: Entry['kind']; mime: string; size: number }[]) {
  const existing = await listEntries();
  const added: Entry[] = [];
  for (const item of items) {
    const id = randomUUID();
    await store().setJSON(`entry/${id}`, { content: item.content, mime: item.mime });
    added.push({ id, path: item.path, kind: item.kind, size: item.size, created: new Date().toISOString() });
  }
  await store().setJSON(indexKey, [...existing, ...added]);
  return added.length;
}
export async function deleteEntry(id: string) {
  const entries = await listEntries();
  if (!entries.some(e => e.id === id)) return false;
  await store().delete(`entry/${id}`);
  await store().setJSON(indexKey, entries.filter(e => e.id !== id));
  return true;
}
