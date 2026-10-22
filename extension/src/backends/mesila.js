// Mesila backend: a ticket is a card on a Mesila board (REST /api/v1, see docs/TICKET-FORMAT.md → Backends).
// Project settings: url (Mesila address), board (KEY), token (agent token msl_…, Mesila → Settings → AI agents).
// The API answers any origin (Bearer only, no cookies), so no host permission is needed for the Mesila address.
const base = project => String(project.url || '').trim().replace(/\/+$/, '');

async function call(project, path, init = {}) {
  if (!project.token) throw new Error('No Mesila token in the project settings');
  let r;
  try {
    r = await fetch(base(project) + path, { ...init, headers: { authorization: 'Bearer ' + project.token, ...(init.headers || {}) } });
  } catch {
    throw new Error('Mesila is not reachable at ' + base(project));
  }
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) throw new Error(`Mesila ${r.status}: ${data?.error || r.statusText}`);
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
  const card = await call(project, `/api/v1/boards/${encodeURIComponent(project.board)}/cards`, { method: 'POST', body: form });
  return { number: card.number, ref: card.ref, url: card.url };
}
