import { buildSnapshot } from './backup.js';
// Settings: shortcut, projects (site origins -> GitHub tasks repository or Mesila board), outbox, name and GitHub token.
const t = k => chrome.i18n.getMessage(k) || k;
const send = msg => new Promise((res, rej) => chrome.runtime.sendMessage(msg, r => (r?.ok ? res(r) : rej(new Error(r?.error || 'failed')))));
document.documentElement.dir = chrome.i18n.getMessage('@@bidi_dir');
document.documentElement.lang = chrome.i18n.getUILanguage();
const i18n = scope => {
  scope.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  scope.querySelectorAll('[data-i18n-html]').forEach(e => { e.innerHTML = t(e.dataset.i18nHtml); });
};
i18n(document);

const $ = id => document.getElementById(id);
const list = $('projects'), tpl = $('tpl');
const lines = s => s.split(/\n+/).map(x => x.trim()).filter(Boolean);
const patterns = origins => origins.map(o => { try { const u = new URL(o); return `${u.protocol}//${u.host}/*`; } catch { return null; } }).filter(Boolean);

function addProject(p = {}) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  i18n(node);
  node.dataset.id = p.id || crypto.randomUUID();
  node.querySelector('[data-k=name]').value = p.name || '';
  node.querySelector('[data-k=repo]').value = p.repo || '';
  node.querySelector('[data-k=backend]').value = p.backend || 'github';
  for (const k of ['url', 'board', 'token']) node.querySelector(`[data-k=${k}]`).value = p[k] || '';
  if (p.connectedFrom) {
    node.dataset.connectedFrom = p.connectedFrom; node.dataset.connectedAt = p.connectedAt || '';
    const note = node.querySelector('.from'); note.hidden = false;
    note.textContent = t('optFromMesila').replace('{date}', new Date(p.connectedAt).toLocaleString(chrome.i18n.getUILanguage(), { dateStyle: 'medium', timeStyle: 'short' }));
  }
  showBackend(node);
  node.querySelector('[data-k=origins]').value = (p.origins || []).join('\n');
  node.open = !p.id; // saved projects start folded, a new one open
  summarize(node);
  list.append(node);
  return node;
}
// the folded header: name · where tickets go · mark
function summarize(node) {
  const p = read(node), bad = invalid(p);
  node.querySelector('.p-name').textContent = p.name || t('optProjectNew');
  node.querySelector('.p-where').textContent = p.backend === 'mesila' ? `Mesila · ${p.board || '—'}` : `GitHub · ${p.repo || '—'}`;
  const mark = node.querySelector('.p-mark');
  mark.textContent = bad && (p.name || p.repo || p.url) ? bad : p.connectedFrom ? t('optConnectedShort') : '';
  mark.className = 'p-mark' + (bad ? ' bad' : '');
}
// only the fields of the chosen backend are shown (and saved)
function showBackend(node) {
  const b = node.querySelector('[data-k=backend]').value;
  node.querySelectorAll('[data-for]').forEach(x => { x.hidden = x.dataset.for !== b; });
}
const val = (node, k) => node.querySelector(`[data-k=${k}]`).value.trim();
const read = node => {
  const p = { id: node.dataset.id, backend: val(node, 'backend'), name: val(node, 'name'), origins: lines(node.querySelector('[data-k=origins]').value) };
  if (p.backend === 'mesila') {
    const m = { ...p, url: val(node, 'url').replace(/\/+$/, ''), board: val(node, 'board').toUpperCase(), token: val(node, 'token') };
    // keep the "connected from Mesila" mark while the address stays the same
    return node.dataset.connectedFrom === m.url ? { ...m, connectedFrom: m.url, connectedAt: node.dataset.connectedAt } : m;
  }
  return { ...p, repo: val(node, 'repo').replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '') };
};
// what is wrong with a project, or null
const invalid = p => {
  if (p.backend !== 'mesila') return /^[\w.-]+\/[\w.-]+$/.test(p.repo) ? null : t('optBadRepo');
  if (!/^https?:\/\/[^/\s]+/.test(p.url)) return t('optBadMesilaUrl');
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(p.board)) return t('optBadBoard');
  return null;
};
list.addEventListener('change', e => { if (e.target.matches('[data-k=backend]')) showBackend(e.target.closest('.project')); });
list.addEventListener('input', e => { const n = e.target.closest('.project'); if (n) summarize(n); });

list.addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const node = b.closest('.project'), out = node.querySelector('.out'), p = read(node);
  const say = (m, cls = '') => { out.textContent = m; out.className = 'out ' + cls; };
  if (b.dataset.act === 'del') { if (confirm(t('optDeleteConfirm'))) { node.remove(); markDirty(); } return; }
  if (b.dataset.act === 'test') {
    say('…');
    try { const r = await send({ type: 'testProject', project: p, token: $('token').value.trim() }); say(`✓ ${r.name}${r.private ? ' (private)' : ''}`, 'ok'); }
    catch (err) { say(err.message, 'err'); }
  }
  if (b.dataset.act === 'perm') {
    const origins = patterns(p.origins);
    if (!origins.length) return say(t('optNoOrigins'), 'err');
    const ok = await chrome.permissions.request({ origins });   // needs this click (a user gesture)
    say(ok ? t('optPermOk') : t('optPermNo'), ok ? 'ok' : 'err');
  }
});
$('add').addEventListener('click', () => addProject().querySelector('input').focus());
// ---------- unsaved changes ----------
const collect = () => ({ token: $('token').value.trim(), reporter: $('reporter').value.trim(), projects: [...list.children].map(read).filter(p => p.name || p.repo || p.url) });
let saved = '';
function markDirty() {
  const dirty = JSON.stringify(collect()) !== saved;
  $('dirty').hidden = !dirty;
  $('save').disabled = !dirty;
  return dirty;
}
document.addEventListener('input', markDirty);
document.addEventListener('change', markDirty);
window.addEventListener('beforeunload', e => { if (markDirty()) e.preventDefault(); });

$('save').addEventListener('click', async () => {
  const data = collect();
  const badNode = [...list.children].find(n => { const p = read(n); return (p.name || p.repo || p.url) && invalid(p); });
  if (badNode) {
    const p = read(badNode); badNode.open = true;
    $('status').textContent = invalid(p) + ': ' + (p.name || p.repo || p.board || '—');
    return;
  }
  await chrome.storage.local.set(data);
  await send({ type: 'syncCatcher' }).catch(() => {});
  saved = JSON.stringify(data); markDirty();
  $('status').textContent = t('optSaved');
  setTimeout(() => { $('status').textContent = ''; }, 2500);
});

const s = await chrome.storage.local.get(['token', 'reporter', 'projects']);
$('token').value = s.token || '';
$('reporter').value = s.reporter || '';
(s.projects?.length ? s.projects : [{}]).forEach(addProject);
saved = JSON.stringify(collect()); markDirty();
// settings changed elsewhere (a board connected from Mesila) while nothing is edited here: show them
chrome.storage.onChanged.addListener(async c => {
  if (!(c.projects || c.token || c.reporter) || markDirty()) return;
  const n = await chrome.storage.local.get(['token', 'reporter', 'projects']);
  $('token').value = n.token || ''; $('reporter').value = n.reporter || '';
  list.replaceChildren(); (n.projects || []).forEach(addProject); saved = JSON.stringify(collect()); markDirty();
});

// ---------- version and shortcut ----------
const ver = chrome.runtime.getManifest().version;
$('version').textContent = ver; $('footer-ver').textContent = 'Fixproof ' + ver;
async function showShortcut() {
  const cmd = (await chrome.commands.getAll()).find(c => c.name === '_execute_action');
  $('shortcut').textContent = cmd?.shortcut || '';
  $('shortcut-none').hidden = !!cmd?.shortcut;
}
showShortcut();
// Chrome lets only its own page assign shortcuts; re-read when the user comes back
$('shortcut-change').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) showShortcut(); });
// the shortcut may be changed in another window: follow Chrome's own event and the window getting focus back
chrome.commands.onChanged?.addListener(showShortcut);
window.addEventListener('focus', showShortcut);
setInterval(() => { if (!document.hidden) showShortcut(); }, 3000);

// ---------- outbox (MSL-102) ----------
const fmtTime = iso => new Date(iso).toLocaleString(chrome.i18n.getUILanguage(), { dateStyle: 'short', timeStyle: 'short' });
async function renderOutbox() {
  const r = await send({ type: 'outboxList' }).catch(() => ({ items: [], sent: [] }));
  const box = $('outbox');
  box.replaceChildren();
  if (!r.items.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = t('optOutboxEmpty'); box.append(li);
  }
  for (const i of r.items) {
    const li = document.createElement('li');
    const title = document.createElement('span'); title.className = 'title'; title.dir = 'auto'; title.textContent = `${i.projectName || ''} · ${i.title}`;
    const sendBtn = document.createElement('button'); sendBtn.type = 'button'; sendBtn.textContent = t('optOutboxSend');
    sendBtn.onclick = async () => { sendBtn.disabled = true; await send({ type: 'outboxSend', id: i.id }).catch(() => {}); renderOutbox(); };
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = t('optOutboxDelete');
    del.onclick = async () => { if (confirm(t('optOutboxDeleteConfirm'))) { await send({ type: 'outboxDelete', id: i.id }); renderOutbox(); } };
    const meta = document.createElement('span'); meta.className = 'meta' + (i.state === 'action' ? ' err' : '');
    meta.textContent = [
      fmtTime(i.createdAt),
      t('optOutboxTries').replace('{n}', i.attempts),
      i.state === 'action' ? t('optOutboxNeedsAction') : t('optOutboxNext').replace('{time}', fmtTime(new Date(i.nextAt).toISOString())),
      i.lastError,
    ].filter(Boolean).join(' · ');
    li.append(title, sendBtn, del, meta);
    box.append(li);
  }
  $('sent-wrap').hidden = !r.sent.length;
  $('sent').replaceChildren(...r.sent.slice(0, 10).map(e => {
    const li = document.createElement('li');
    const a = document.createElement(e.url ? 'a' : 'span');
    if (e.url) { a.href = e.url; a.target = '_blank'; a.rel = 'noopener'; }
    a.dir = 'auto'; a.textContent = `${e.ref ? e.ref + ' · ' : ''}${e.title}`;
    const meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = `${e.project || ''} · ${fmtTime(e.at)}${e.attempts > 1 ? ' · ' + t('optOutboxTries').replace('{n}', e.attempts) : ''}`;
    li.append(a, meta);
    return li;
  }));
}
renderOutbox();
chrome.storage.onChanged.addListener(c => { if (c.outbox || c.sentLog) renderOutbox(); });


// ---------- backup: Mesila account and file (MSL-321) ----------
const backupOut = $('backup-out');
const sayBackup = (m, cls = '') => { backupOut.textContent = m; backupOut.className = 'msg ' + cls; };
const lang = (l => (['ru', 'he'].includes(l) ? l : 'en'))(chrome.i18n.getUILanguage().slice(0, 2));
const mesilaPage = home => `${home}/${lang}/settings/agents#fixproof`;
const stored = () => chrome.storage.local.get(['token', 'reporter', 'projects']);
async function showBackup() {
  const r = await send({ type: 'backupStatus' }).catch(() => null);
  if (r?.saved) sayBackup(t('optBackupSavedAt').replace('{date}', fmtTime(r.updated_at)).replace('{n}', r.snapshot.projects.length));
  else if (r?.noKey) sayBackup(t('optBackupNoKey'));
}
showBackup();
$('backup-save').addEventListener('click', async () => {
  if (markDirty()) return sayBackup(t('optBackupSaveFirst'), 'err');
  sayBackup('…');
  try {
    const r = await send({ type: 'backupSave' });
    if (r.noKey) { chrome.tabs.create({ url: mesilaPage(r.home) }); return sayBackup(t('optBackupOpened'), 'ok'); }
    sayBackup(t('optBackupSaved').replace('{n}', r.projects), 'ok');
  } catch (err) { sayBackup(err.message, 'err'); }
});
// a clean profile has no key: Mesila restores from its own page (signed in), with new keys for its boards
$('backup-restore').addEventListener('click', async () => {
  const r = await send({ type: 'backupStatus' }).catch(() => ({ home: 'https://mesila.firstmark.app' }));
  chrome.tabs.create({ url: mesilaPage(r.home) });
  sayBackup(t('optBackupOpened'), 'ok');
});
$('export').addEventListener('click', async () => {
  if (markDirty()) return sayBackup(t('optBackupSaveFirst'), 'err');
  const body = { fixproof: 'settings', version: ver, exportedAt: new Date().toISOString(), ...buildSnapshot(await stored()) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  a.download = `fixproof-settings-${body.exportedAt.slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data?.fixproof !== 'settings') throw new Error(t('optImportBad'));
    const r = await send({ type: 'importFile', data });
    sayBackup(t('optImported').replace('{n}', r.count), 'ok');
  } catch (err) { sayBackup(err instanceof SyntaxError ? t('optImportBad') : err.message, 'err'); }
});
// after a restore the sites have to be allowed again: one click for all of them (a user gesture)
$('allow-sites').addEventListener('click', async () => {
  const origins = [...new Set(patterns(((await stored()).projects || []).flatMap(p => p.origins || [])))];
  if (!origins.length) return sayBackup(t('optNoOrigins'), 'err');
  const ok = await chrome.permissions.request({ origins });
  sayBackup(ok ? t('optPermOk') : t('optPermNo'), ok ? 'ok' : 'err');
});
