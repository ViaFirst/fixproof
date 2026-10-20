// Runs in the page's own JS world from document_start, only on sites of the user's projects (opt-in per site).
// Keeps the last console errors/warnings and uncaught errors so a bug report can include what happened before it.
(() => {
  if (window.__fixproof) return;
  const log = { console: [] };
  Object.defineProperty(window, '__fixproof', { value: log, enumerable: false });
  const push = (level, parts) => {
    const text = parts.map(p => { try { return p instanceof Error ? `${p.name}: ${p.message}` : typeof p === 'string' ? p : JSON.stringify(p); } catch { return String(p); } }).join(' ').slice(0, 500);
    log.console.push({ level, text, at: new Date().toISOString() });
    if (log.console.length > 50) log.console.shift();
  };
  for (const level of ['error', 'warn']) {
    const orig = console[level];
    console[level] = function (...a) { push(level, a); return orig.apply(this, a); };
  }
  addEventListener('error', e => { if (e.message) push('error', [`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`]); else if (e.target?.src || e.target?.href) push('error', ['Failed to load ' + (e.target.src || e.target.href)]); }, true);
  addEventListener('unhandledrejection', e => push('error', ['Unhandled rejection: ' + (e.reason?.message || e.reason)]));
})();
