// Service worker: starts the overlay, takes the screenshot, collects the page log, sends tickets.
import * as github from './backends/github.js';
import * as mesila from './backends/mesila.js';
import * as outbox from './outbox.js';

const BACKENDS = { github, mesila };
// a project can send: GitHub needs the shared token, Mesila its own per-project token
const canSend = (s, p) => ((p.backend || 'github') === 'mesila' ? !!(p.token && p.url && p.board) : !!s.token);
const VERSION = chrome.runtime.getManifest().version;
const CATCHER_ID = 'fixproof-catcher';

const getSettings = async () => ({ token: '', reporter: '', projects: [], ...(await chrome.storage.local.get(['token', 'reporter', 'projects'])) });
// "https://example.com" -> "https://example.com/*"
const pattern = origin => { try { const u = new URL(origin.trim()); return `${u.protocol}//${u.host}/*`; } catch { return null; } };
export const projectFor = (projects, url) => {
  const o = new URL(url).origin;
  return projects.find(p => (p.origins || []).some(x => { try { return new URL(x.trim()).origin === o; } catch { return false; } }));
};

// the console/error buffer runs from document_start, but only on sites of the user's projects that they allowed
async function syncCatcher() {
  const { projects } = await getSettings();
  const wanted = [...new Set(projects.flatMap(p => (p.origins || []).map(pattern)).filter(Boolean))];
  const granted = [];
  for (const m of wanted) if (await chrome.permissions.contains({ origins: [m] })) granted.push(m);
  await chrome.scripting.unregisterContentScripts({ ids: [CATCHER_ID] }).catch(() => {});
  if (granted.length) await chrome.scripting.registerContentScripts([{ id: CATCHER_ID, matches: granted, js: ['src/content/catcher.js'], runAt: 'document_start', world: 'MAIN', allFrames: false, persistAcrossSessions: true }]);
  return granted;
}
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncCatcher();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.permissions.onAdded.addListener(syncCatcher);
chrome.permissions.onRemoved.addListener(syncCatcher);
chrome.storage.onChanged.addListener(c => { if (c.projects) syncCatcher(); });

// ---------- outbox: tickets that could not be sent yet (MSL-102) ----------
const t = k => chrome.i18n.getMessage(k) || k;
async function sendQueued(item) {
  const s = await getSettings();
  const p = s.projects.find(x => x.id === item.projectId);
  if (!p) throw new outbox.SendError(t('outboxNoProject'), { action: true });
  if (!canSend(s, p)) throw new outbox.SendError(t('outboxNoAccess'), { action: true });
  return BACKENDS[p.backend || 'github'].createTicket(s, p, rebuild(item.ticket));
}
async function notifySent(item, r) {
  await chrome.notifications.create('sent:' + (r.url || item.id), {
    type: 'basic', iconUrl: 'icons/128.png', title: t('outboxSentTitle'),
    message: `${r.ref || (r.number ? '#' + r.number : '')} · ${item.title}`.trim(), priority: 0,
  }).catch(() => {});
}
const runOutbox = (opts = {}) => outbox.process(sendQueued, { onSent: notifySent, ...opts });
chrome.alarms.onAlarm.addListener(a => { if (a.name === outbox.ALARM_NAME) runOutbox(); });
chrome.runtime.onStartup.addListener(() => { outbox.sync(); runOutbox(); });
chrome.runtime.onInstalled.addListener(() => { outbox.sync(); });
self.addEventListener('online', () => runOutbox());
chrome.notifications.onClicked.addListener(id => {
  if (id.startsWith('sent:http')) chrome.tabs.create({ url: id.slice(5) });
  chrome.notifications.clear(id);
});
// settings changed (a token fixed, a board reconnected): tickets waiting for the user get another try
chrome.storage.onChanged.addListener(async c => {
  if (c.projects || c.token) {
    const waiting = (await outbox.list()).filter(i => i.state === 'action').map(i => i.id);
    if (waiting.length) runOutbox({ force: waiting });
  }
});

chrome.action.onClicked.addListener(async tab => {
  if (!/^https?:/.test(tab.url || '')) return;
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: '#fixproof-root{all:initial}' }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/overlay.js'] });
});

// page-side facts that only the page's own JS world can see
function readPageLog() {
  const log = window.__fixproof || { console: [] };
  const failed = performance.getEntriesByType('resource').filter(e => e.responseStatus >= 400).slice(-20)
    .map(e => ({ url: e.name, status: e.responseStatus, type: e.initiatorType }));
  const nav = performance.getEntriesByType('navigation')[0];
  return { console: log.console.slice(-20), network: failed, pageStatus: nav?.responseStatus || null, catcher: !!window.__fixproof };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab?.id;
  (async () => {
    switch (msg.type) {
      case 'capture': return { dataUrl: await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }) };
      case 'pageLog': {
        const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readPageLog }).catch(() => [{}]);
        return res?.result || { console: [], network: [] };
      }
      case 'context': {
        const s = await getSettings();
        const p = projectFor(s.projects, sender.tab.url);
        return { project: p || null, projects: s.projects.map(x => ({ id: x.id, name: x.name })), hasToken: s.projects.some(x => canSend(s, x)), reporter: s.reporter, version: VERSION };
      }
      case 'submit': {
        const s = await getSettings();
        const p = s.projects.find(x => x.id === msg.projectId) || projectFor(s.projects, sender.tab.url);
        if (!p) throw new Error('No project for this site');
        if (!canSend(s, p)) throw new Error((p.backend || 'github') === 'mesila' ? 'No Mesila address, board or token in the project settings' : 'No GitHub token in the settings');
        // every ticket has an id: retries from the outbox reuse it, so the backend never makes a duplicate
        const id = msg.ticket.id || crypto.randomUUID(), createdAt = new Date().toISOString();
        const ticket = { ...msg.ticket, id, createdAt, meta: { ...msg.ticket.meta, id } };
        try {
          return await BACKENDS[p.backend || 'github'].createTicket(s, p, rebuild(ticket));
        } catch (e) {
          // backend down / no answer → keep it and send later; a broken token or board → keep it until fixed
          if (!e.retry && !e.action) throw e;
          const state = e.retry ? 'pending' : 'action';
          await outbox.add({ id, projectId: p.id, projectName: p.name, title: ticket.title, ticket, createdAt, attempts: 1, state, nextAt: Date.now() + outbox.delayFor(1), lastError: e.message, lastTryAt: createdAt });
          return { queued: true, state, error: e.message };
        }
      }
      case 'openOptions': chrome.runtime.openOptionsPage(); return {};
      case 'testProject': { const s = await getSettings(); return BACKENDS[msg.project.backend || 'github'].test({ ...s, token: msg.token || s.token }, msg.project); }
      case 'syncCatcher': return { granted: await syncCatcher() };
      // settings page → outbox: list without screenshots, send now, delete
      case 'outboxList': return {
        items: (await outbox.list()).map(({ ticket, ...i }) => ({ ...i, images: ticket.images.length })),
        sent: await outbox.sentLog(),
      };
      case 'outboxSend': await runOutbox({ force: [msg.id] }); return {};
      case 'outboxDelete': await outbox.remove(msg.id); return {};
    }
    throw new Error('unknown message ' + msg.type);
  })().then(r => reply({ ok: true, ...r }), e => reply({ ok: false, error: e.message }));
  return true;
});

// ---------- Mesila connects a board (MSL-75) ----------
// Only the Mesila sites in manifest "externally_connectable" can send these messages. The project's Mesila address
// is the sender's own origin (never taken from the message), so a token is only ever sent back to the site that gave it.
const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export function mesilaProjectFrom(origin, msg, projects) {
  const board = String(msg.board || '').toUpperCase();
  if (!KEY_RE.test(board)) throw new Error('bad board key');
  if (!/^msl_[A-Za-z0-9_-]{16,}$/.test(String(msg.token || ''))) throw new Error('bad token');
  const sites = (Array.isArray(msg.sites) ? msg.sites : []).flatMap(x => { try { const u = new URL(String(x)); return /^https?:$/.test(u.protocol) ? [u.origin] : []; } catch { return []; } }).slice(0, 20);
  const same = p => p.backend === 'mesila' && p.url === origin && p.board === board;
  const old = projects.find(same);
  const project = {
    ...(old || { id: crypto.randomUUID(), origins: [] }),
    backend: 'mesila', url: origin, board, token: msg.token,
    name: String(msg.name || '').trim().slice(0, 80) || old?.name || board,
    origins: [...new Set([...(old?.origins || []), ...sites])],
    connectedFrom: origin, connectedAt: new Date().toISOString(),
  };
  return { projects: old ? projects.map(p => (same(p) ? project : p)) : [...projects, project], project, created: !old };
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  const origin = sender.origin || (sender.url && new URL(sender.url).origin);
  (async () => {
    const { projects } = await getSettings();
    if (msg?.type === 'ping') {
      const board = String(msg.board || '').toUpperCase();
      return { version: VERSION, connected: projects.some(p => p.backend === 'mesila' && p.url === origin && p.board === board) };
    }
    if (msg?.type === 'connect') {
      const r = mesilaProjectFrom(origin, msg, projects);
      await chrome.storage.local.set({ projects: r.projects });
      return { version: VERSION, created: r.created, project: { name: r.project.name, board: r.project.board } };
    }
    throw new Error('unknown message');
  })().then(r => reply({ ok: true, ...r }), e => reply({ ok: false, error: e.message }));
  return true;
});

// the overlay sends plain data; the body is rendered here, once the screenshot URLs are known
function rebuild(t) {
  return { ...t, bodyFor: images => renderBody(t, images) };
}
function renderBody(t, images) {
  const L = t.strings, m = { ...t.meta, screenshots: images.map(i => i.path).filter(Boolean), client: 'fixproof-extension/' + VERSION };
  const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = [
    [L.page, `${decodeURI(m.url)}`],
    m.element && [L.element, `\`${esc(m.element.selector)}\`${m.element.text ? ' — «' + esc(m.element.text.slice(0, 80)) + '»' : ''}`],
    [L.screen, `${m.viewport.w}×${m.viewport.h} · ${m.device} · ${m.browser} · ${m.os}`],
    [L.consoleErrors, (n => (n ? String(n) : '—') + (m.console.length - n ? ` (+${m.console.length - n} ${L.warnings})` : ''))(m.console.filter(c => c.level === 'error').length)],
    [L.failedRequests, m.network.length ? String(m.network.length) : '—'],
  ].filter(Boolean);
  const details = [
    m.console.length && `**Console**\n\n\`\`\`\n${m.console.map(c => `[${c.level}] ${c.text}`).join('\n').slice(0, 4000)}\n\`\`\``,
    m.network.length && `**Network**\n\n\`\`\`\n${m.network.map(n => `${n.status} ${n.type} ${n.url}`).join('\n').slice(0, 3000)}\n\`\`\``,
    m.element?.html && `**HTML**\n\n\`\`\`html\n${m.element.html}\n\`\`\``,
  ].filter(Boolean).join('\n\n');
  return [
    t.description?.trim() || '',
    images.map(i => `![screenshot](${i.url})`).join('\n\n'),
    `| | |\n|---|---|\n${rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}`,
    details && `<details><summary>${L.technical}</summary>\n\n${details}\n\n</details>`,
    `<!-- fixproof:v1\n${JSON.stringify(m).replace(/--/g, '-\\u002d')}\n-->`,
  ].filter(Boolean).join('\n\n');
}
