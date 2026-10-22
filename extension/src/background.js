// Service worker: starts the overlay, takes the screenshot, collects the page log, sends tickets.
import * as github from './backends/github.js';
import * as mesila from './backends/mesila.js';

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
        return BACKENDS[p.backend || 'github'].createTicket(s, p, rebuild(msg.ticket));
      }
      case 'openOptions': chrome.runtime.openOptionsPage(); return {};
      case 'testProject': { const s = await getSettings(); return BACKENDS[msg.project.backend || 'github'].test({ ...s, token: msg.token || s.token }, msg.project); }
      case 'syncCatcher': return { granted: await syncCatcher() };
    }
    throw new Error('unknown message ' + msg.type);
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
