// Settings backup (MSL-321): "Save to Mesila" / "Restore from Mesila" and export/import as a file.
// A snapshot is { v: 1, reporter, projects } without tokens; secrets go apart: { github, tokens: { projectId: key } }.
// A project on the Mesila the snapshot is saved to is marked here: no address and no key in the snapshot; on restore
// the address is the page that restored it and Mesila gives a new key (tokens). Pure functions: tested in tools/e2e-connect.mjs.

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const str = (v, max) => String(v ?? '').slice(0, max);

// settings → { snapshot, secrets }; here = the Mesila origin it goes to (null for a file: every key in secrets)
export function buildSnapshot(settings, here = null) {
  const secrets = { tokens: {} };
  if (settings.token) secrets.github = settings.token;
  const projects = (settings.projects || []).map(p => {
    const base = { id: p.id, name: p.name || '', backend: p.backend || 'github', origins: p.origins || [], ...(p.label ? { label: p.label } : {}) };
    if (base.backend !== 'mesila') return { ...base, repo: p.repo || '' };
    if (here && p.url === here) return { ...base, here: true, board: p.board };
    if (p.token) secrets.tokens[p.id] = p.token;
    return { ...base, url: p.url, board: p.board };
  });
  if (!Object.keys(secrets.tokens).length) delete secrets.tokens;
  return { snapshot: { v: 1, reporter: settings.reporter || '', projects }, secrets };
}

const origin = x => { try { const u = new URL(String(x)); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } };

// a snapshot (from Mesila or a file) → settings. here = the Mesila origin that sent it (its projects get this address and the
// new keys from tokens). Projects with the same id, board or repository are replaced, the others stay.
export function applySnapshot(settings, data, here = null, now = new Date().toISOString()) {
  const s = data?.snapshot;
  if (!s || s.v !== 1 || !Array.isArray(s.projects)) throw new Error('bad snapshot');
  const secrets = data.secrets || {}, tokens = data.tokens || {};
  const incoming = s.projects.slice(0, 100).flatMap(p => {
    const backend = p.backend === 'mesila' ? 'mesila' : 'github';
    const base = {
      id: str(p.id, 100) || crypto.randomUUID(), name: str(p.name, 200), backend,
      origins: [...new Set((Array.isArray(p.origins) ? p.origins : []).map(origin).filter(Boolean))].slice(0, 50),
      ...(p.label ? { label: str(p.label, 100) } : {}),
    };
    if (backend === 'github') return [{ ...base, repo: str(p.repo, 200) }];
    const board = str(p.board, 10).toUpperCase();
    if (!KEY_RE.test(board)) return [];
    if (p.here) {
      if (!here) return [];
      const token = typeof tokens[p.id] === 'string' ? tokens[p.id] : '';
      return [{ ...base, url: here, board, token, ...(token ? { connectedFrom: here, connectedAt: now } : {}) }];
    }
    const url = origin(p.url);
    if (!url) return [];
    return [{ ...base, url, board, token: typeof secrets.tokens?.[p.id] === 'string' ? secrets.tokens[p.id] : '' }];
  });
  const same = (a, b) => a.id === b.id || (a.backend === b.backend && (a.backend === 'mesila' ? a.url === b.url && a.board === b.board : a.repo && a.repo === b.repo));
  const projects = [];
  for (const p of settings.projects || []) {
    const n = incoming.find(x => same(x, p));
    // a key this browser already has stays when Mesila could not give a new one
    if (n) { if (!n.token && p.token && p.backend === 'mesila' && p.url === n.url) n.token = p.token; }
    else projects.push(p);
  }
  return {
    count: incoming.length,
    projects: [...projects, ...incoming],
    reporter: s.reporter ? str(s.reporter, 200) : settings.reporter || '',
    token: typeof secrets.github === 'string' && secrets.github ? secrets.github : settings.token || '',
  };
}

// the Mesila address to save to / restore from: the main one if a project uses it, else the first Mesila project's
export const MESILA_HOME = 'https://mesila.firstmark.app';
export function mesilaHome(projects) {
  const m = (projects || []).filter(p => p.backend === 'mesila' && p.url);
  return m.find(p => p.url === MESILA_HOME)?.url || m[0]?.url || MESILA_HOME;
}
