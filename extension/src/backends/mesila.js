// Mesila backend: a ticket is a card on a Mesila board (REST /api/v1, see docs/TICKET-FORMAT.md → Backends).
// Project settings: url (Mesila address), board (KEY), token (API key msl_…, Mesila → API keys; or the board's Connect button).
// The API answers any origin (Bearer only, no cookies), so no host permission is needed for the Mesila address.
import { errorFor, SendError } from '../outbox.js';

const base = project => String(project.url || '').trim().replace(/\/+$/, '');
const tr = k => chrome.i18n.getMessage(k) || k;

async function call(project, path, init = {}) {
  if (!project.token) throw new SendError('No Mesila token in the project settings', { action: true });
  let r;
  try {
    r = await fetch(base(project) + path, { ...init, signal: AbortSignal.timeout(60_000), headers: { authorization: 'Bearer ' + project.token, ...(init.headers || {}) } });
  } catch {
    // no answer, or an answer without CORS headers (a dead or moved address looks the same): keep retrying, but say what to check
    throw errorFor(0, tr('mesilaUnreachable').replace('{url}', base(project)));
  }
  const data = await r.json().catch(() => null);
  // something else answers at this address (Mesila moved, a parked or paywalled domain — the old Vercel address gave 402):
  // a retry will not help, the user has to fix the address or connect the board again
  if (typeof data?.ok !== 'boolean' && r.status < 500 && r.status !== 408 && r.status !== 429) {
    throw new SendError(tr('mesilaNotHere').replace('{url}', base(project)).replace('{status}', r.status), { status: r.status, action: true });
  }
  if (!r.ok || !data?.ok) throw errorFor(r.status, `Mesila ${r.status}: ${data?.error || r.statusText}`);
  return data.data;
}

export async function test(settings, project) {
  const b = await call(project, `/api/v1/boards/${encodeURIComponent(project.board)}`);
  if (!['owner', 'admin', 'member'].includes(b.role)) throw new Error(`No write access to ${b.key} (role: ${b.role})`);
  return { name: `${b.key} · ${b.name}`, private: true };
}

// ticket: { title, labels[], bodyFor(images) -> markdown, meta, images: [{ name, dataUrl }] }
export async function createTicket(settings, project, ticket) {
  const form = new FormData();
  form.set('title', ticket.title);
  // one request: Mesila swaps ![…](attachment:N) for the uploaded files
  form.set('description', ticket.bodyFor(ticket.images.map((_, i) => ({ url: `attachment:${i}` }))));
  // GitHub-style labels ("type: bug", "device: mobile") plus the bare type ("bug"); Mesila keeps the ones the
  // board has and ignores the rest. Status is the column, priority is a card field.
  const labels = ticket.labels.filter(l => !l.startsWith('status: ') && !l.startsWith('priority: '));
  const type = labels.find(l => l.startsWith('type: '));
  for (const l of [...labels, ...(type ? [type.slice(6)] : []), ...(project.label ? [project.label] : [])]) form.append('labels', l);
  if (ticket.labels.includes('priority: high')) form.set('priority', 'high');
  for (const img of ticket.images) form.append('files', await (await fetch(img.dataUrl)).blob(), img.name);
  // the same ticket id on every retry: Mesila returns the card it already made instead of a duplicate (MSL-101)
  const card = await call(project, `/api/v1/boards/${encodeURIComponent(project.board)}/cards`, { method: 'POST', body: form, headers: ticket.id ? { 'idempotency-key': ticket.id } : {} });
  // agent: the board's "Fixproof → AI" rule gave the card to this agent; replayed: a retry found the card already made
  return { number: card.number, ref: card.ref, url: card.url, agent: card.agent_task || null, replayed: !!card.replayed };
}

// settings backup in the key owner's Mesila account (MSL-321): no secrets come back, only what is saved and when
export const saveSettings = (project, body) =>
  call(project, '/api/v1/me/fixproof-settings', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
export const savedSettings = project => call(project, '/api/v1/me/fixproof-settings');
