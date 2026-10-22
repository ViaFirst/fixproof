// Settings: GitHub token, reporter name, projects (site origins -> GitHub tasks repository or Mesila board).
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
  list.append(node);
  return node;
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

list.addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const node = b.closest('.project'), out = node.querySelector('.out'), p = read(node);
  const say = (m, cls = '') => { out.textContent = m; out.className = 'out ' + cls; };
  if (b.dataset.act === 'del') { if (confirm(t('optDeleteConfirm'))) node.remove(); return; }
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
$('save').addEventListener('click', async () => {
  const projects = [...list.children].map(read).filter(p => p.name || p.repo || p.url);
  const bad = projects.find(invalid);
  if (bad) { $('status').textContent = invalid(bad) + ': ' + (bad.name || bad.repo || bad.board || '—'); return; }
  await chrome.storage.local.set({ token: $('token').value.trim(), reporter: $('reporter').value.trim(), projects });
  await send({ type: 'syncCatcher' }).catch(() => {});
  $('status').textContent = t('optSaved');
  setTimeout(() => { $('status').textContent = ''; }, 2500);
});

const s = await chrome.storage.local.get(['token', 'reporter', 'projects']);
$('token').value = s.token || '';
$('reporter').value = s.reporter || '';
(s.projects?.length ? s.projects : [{}]).forEach(addProject);
