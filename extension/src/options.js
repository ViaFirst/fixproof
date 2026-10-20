// Settings: GitHub token, reporter name, projects (site origins -> tasks repository).
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
  node.querySelector('[data-k=origins]').value = (p.origins || []).join('\n');
  list.append(node);
  return node;
}
const read = node => ({ id: node.dataset.id, backend: 'github', name: node.querySelector('[data-k=name]').value.trim(), repo: node.querySelector('[data-k=repo]').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), origins: lines(node.querySelector('[data-k=origins]').value) });

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
  const projects = [...list.children].map(read).filter(p => p.name || p.repo);
  const bad = projects.find(p => !/^[\w.-]+\/[\w.-]+$/.test(p.repo));
  if (bad) { $('status').textContent = t('optBadRepo') + ': ' + (bad.name || bad.repo || '—'); return; }
  await chrome.storage.local.set({ token: $('token').value.trim(), reporter: $('reporter').value.trim(), projects });
  await send({ type: 'syncCatcher' }).catch(() => {});
  $('status').textContent = t('optSaved');
  setTimeout(() => { $('status').textContent = ''; }, 2500);
});

const s = await chrome.storage.local.get(['token', 'reporter', 'projects']);
$('token').value = s.token || '';
$('reporter').value = s.reporter || '';
(s.projects?.length ? s.projects : [{}]).forEach(addProject);
