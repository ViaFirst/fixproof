// Fixproof overlay, injected into the page on demand (toolbar button / Alt+Shift+B).
// 1) pick: an element, an area or the whole screen; 2) annotate the screenshot and describe; 3) send.
// Everything lives in one shadow root, so the page's CSS cannot touch it and it cannot touch the page.
(() => {
  const old = document.getElementById('fixproof-root');
  if (old) { old.remove(); return; }                       // second click = close

  const t = (k, subs) => chrome.i18n.getMessage(k, subs) || k;
  const send = msg => new Promise((res, rej) => chrome.runtime.sendMessage(msg, r => (r?.ok ? res(r) : rej(new Error(r?.error || chrome.runtime.lastError?.message || 'failed')))));
  const RED = '#ff2d55';
  const dir = chrome.i18n.getMessage('@@bidi_dir') || 'ltr';

  const host = document.createElement('div');
  host.id = 'fixproof-root';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
    .layer{position:fixed;inset:0;pointer-events:auto;cursor:crosshair}
    .hl{position:fixed;border:2px solid ${RED};background:rgba(255,45,85,.08);border-radius:3px;pointer-events:none;transition:all .06s}
    .hl b{position:absolute;inset-block-end:100%;inset-inline-start:-2px;background:${RED};color:#fff;font:600 11px/1.6 ui-monospace,Menlo,monospace;padding:0 6px;border-radius:3px 3px 0 0;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis}
    .bar{position:fixed;inset-block-start:14px;inset-inline-start:50%;translate:-50% 0;display:flex;gap:4px;align-items:center;background:#111;color:#fff;border-radius:12px;padding:5px;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:auto;font-size:13px}
    :host([dir=rtl]) .bar{translate:50% 0}
    .bar .logo{font-weight:800;padding:0 10px 0 8px;letter-spacing:-.01em}.bar .logo i{color:${RED};font-style:normal}
    .bar button{all:unset;cursor:pointer;padding:7px 11px;border-radius:8px;color:#ddd}
    .bar button:hover{background:#2a2a2a;color:#fff}.bar button[aria-pressed=true]{background:#fff;color:#111}
    .bar .hint{color:#999;padding:0 10px;font-size:12px}
    .back{position:fixed;inset:0;background:rgba(10,10,14,.6);pointer-events:auto;display:grid;place-items:center;padding:20px}
    .panel{background:#fff;color:#111;border-radius:16px;inline-size:min(1280px,100%);max-block-size:100%;display:grid;grid-template-columns:1fr 340px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)}
    @media (max-width:900px){.panel{grid-template-columns:1fr;overflow:auto}}
    .shot{background:#eef0f3;display:flex;flex-direction:column;min-block-size:0}
    .tools{display:flex;gap:4px;padding:8px;border-block-end:1px solid #e3e5e8;align-items:center}
    .tools button{all:unset;cursor:pointer;padding:6px 10px;border-radius:7px;font-size:13px;color:#333}
    .tools button:hover{background:#e3e5e8}.tools button[aria-pressed=true]{background:#111;color:#fff}
    .tools .sp{flex:1}
    .canvas-wrap{overflow:auto;padding:12px;display:grid;place-items:center;min-block-size:0;max-block-size:calc(100vh - 110px)}
    canvas{max-inline-size:100%;max-block-size:calc(100vh - 140px);border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:crosshair;background:#fff}
    form{display:flex;flex-direction:column;gap:12px;padding:18px;overflow:auto;max-block-size:calc(100vh - 40px)}
    h2{margin:0;font-size:17px}
    label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:#555}
    input[type=text],textarea,select{font:inherit;font-size:14px;font-weight:400;color:#111;border:1px solid #cfd3d8;border-radius:9px;padding:9px 11px;background:#fff;inline-size:100%}
    input:focus,textarea:focus,select:focus{outline:2px solid #111;outline-offset:0;border-color:#111}
    textarea{min-block-size:110px;resize:vertical}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .check{flex-direction:row;align-items:center;gap:8px;font-weight:500;color:#111;font-size:13px}
    .ctx{font-size:12px;color:#666;background:#f5f6f8;border-radius:9px;padding:9px 11px;line-height:1.5;word-break:break-word}
    .ctx b{color:#111;font-weight:600}
    .actions{display:flex;gap:8px;margin-block-start:auto}
    .btn{all:unset;cursor:pointer;text-align:center;padding:11px 16px;border-radius:10px;font-weight:600;font-size:14px}
    .btn.primary{background:${RED};color:#fff;flex:1}.btn.primary:hover{filter:brightness(1.08)}.btn.primary[disabled]{opacity:.5;cursor:default}
    .btn.ghost{background:#eef0f3;color:#111}
    .msg{font-size:13px;line-height:1.5}.msg.err{color:#c4002b}.msg.ok{color:#0a7a3b}
    .msg a{color:inherit;font-weight:700}
    .warn{font-size:13px;background:#fff4d6;border-radius:9px;padding:9px 11px;line-height:1.5}
    .warn button{all:unset;cursor:pointer;text-decoration:underline;font-weight:600}
  </style>`;
  host.setAttribute('dir', dir);

  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.innerHTML = html; return e; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const close = () => { removeEventListener('keydown', onKey, true); host.remove(); };
  const trail = [];                                           // ArrowUp goes to the parent, ArrowDown back
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
    if (mode !== 'element' || !cur || !root.querySelector('.layer')) return;
    if (e.key === 'ArrowUp' && cur.parentElement && cur.parentElement !== document.documentElement) { trail.push(cur); cur = cur.parentElement; }
    else if (e.key === 'ArrowDown' && trail.length) cur = trail.pop();
    else if (e.key === 'Enter') { e.preventDefault(); return pick({ kind: 'element', node: cur }); }
    else return;
    e.preventDefault(); e.stopPropagation(); box(cur.getBoundingClientRect(), describe(cur));
  };
  addEventListener('keydown', onKey, true);

  // ---------- 1. pick ----------
  let mode = 'element';
  const layer = el('div', { class: 'layer' });
  const hl = el('div', { class: 'hl' }, '<b></b>'); hl.style.display = 'none';
  const bar = el('div', { class: 'bar', role: 'toolbar' }, `<span class="logo">Fix<i>proof</i></span>
    <button data-m="element" aria-pressed="true">${t('modeElement')}</button>
    <button data-m="area" aria-pressed="false">${t('modeArea')}</button>
    <button data-m="screen" aria-pressed="false">${t('modeScreen')}</button>
    <span class="hint">${t('hintElement')}</span>
    <button data-x>${t('cancel')}</button>`);
  root.append(layer, hl, bar);
  const hint = bar.querySelector('.hint');
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-x')) return close();
    mode = b.dataset.m;
    bar.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', x === b));
    hl.style.display = 'none';
    if (mode === 'screen') return pick({ kind: 'page' });
    hint.textContent = t(mode === 'area' ? 'hintArea' : 'hintElement');
  });

  const under = (x, y) => { layer.style.pointerEvents = 'none'; host.style.display = 'none'; const e = document.elementFromPoint(x, y); host.style.display = ''; layer.style.pointerEvents = 'auto'; return e; };
  const box = (r, label) => { Object.assign(hl.style, { display: 'block', left: r.x - 2 + 'px', top: r.y - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' }); hl.firstChild.textContent = label || ''; hl.firstChild.style.display = label ? '' : 'none'; };
  let cur = null, drag = null;
  layer.addEventListener('mousemove', e => {
    if (mode === 'element') { const u = under(e.clientX, e.clientY); if (trail.length && trail[0].contains(u) && cur?.contains(u)) return; trail.length = 0; cur = u; if (cur && cur !== document.documentElement) box(cur.getBoundingClientRect(), describe(cur)); }
    else if (mode === 'area' && drag) { const r = rectOf(drag, e); box(new DOMRect(r.x, r.y, r.w, r.h)); }
  });
  layer.addEventListener('mousedown', e => { if (mode === 'area') { drag = { x: e.clientX, y: e.clientY }; e.preventDefault(); } });
  layer.addEventListener('mouseup', e => {
    if (mode === 'area' && drag) { const r = rectOf(drag, e); drag = null; if (r.w > 8 && r.h > 8) pick({ kind: 'area', area: r }); }
  });
  layer.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (mode === 'element' && cur) pick({ kind: 'element', node: cur }); });
  layer.addEventListener('wheel', () => { hl.style.display = 'none'; }, { passive: true });
  const rectOf = (a, e) => ({ x: Math.min(a.x, e.clientX), y: Math.min(a.y, e.clientY), w: Math.abs(e.clientX - a.x), h: Math.abs(e.clientY - a.y) });

  function describe(n) {
    let s = n.tagName.toLowerCase();
    if (n.id) s += '#' + n.id;
    else if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
    const r = n.getBoundingClientRect();
    return `${s}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  }
  // short CSS selector that matches only this element
  function selectorOf(n) {
    const ok = c => c && !/[:[\]/]|^(is-|has-|js-|active|hover|focus|open|show|visible|selected|current)/.test(c) && !/\d{3,}/.test(c);
    const uniq = s => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } };
    if (n.id && !/\d{3,}/.test(n.id) && uniq('#' + CSS.escape(n.id))) return '#' + CSS.escape(n.id);
    const parts = [];
    for (let e = n; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id && !/\d{3,}/.test(e.id)) { parts.unshift('#' + CSS.escape(e.id) + (parts.length ? '' : '')); if (uniq(parts.join(' > '))) return parts.join(' > '); continue; }
      const cls = (typeof e.className === 'string' ? e.className.trim().split(/\s+/) : []).filter(ok).slice(0, 2);
      if (cls.length) p += '.' + cls.map(c => CSS.escape(c)).join('.');
      const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p);
      if (uniq(parts.join(' > '))) return parts.join(' > ');
    }
    return parts.join(' > ');
  }

  // ---------- 2. capture ----------
  async function pick(sel) {
    const meta = facts();
    if (sel.kind === 'element') {
      const n = sel.node, r = n.getBoundingClientRect();
      meta.element = { selector: selectorOf(n), text: (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200), html: n.outerHTML.replace(/\s+/g, ' ').slice(0, 1000), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    }
    if (sel.kind === 'area') meta.area = { x: Math.round(sel.area.x), y: Math.round(sel.area.y), w: Math.round(sel.area.w), h: Math.round(sel.area.h) };
    meta.kind = sel.kind;
    root.querySelectorAll('.layer,.hl,.bar').forEach(x => x.remove());
    host.style.display = 'none';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))));
    let shot, log;
    try { [shot, log] = await Promise.all([send({ type: 'capture' }), send({ type: 'pageLog' })]); }
    catch (e) { host.style.display = ''; alert('Fixproof: ' + e.message); return close(); }
    host.style.display = '';
    meta.console = log.console || []; meta.network = log.network || []; meta.catcher = log.catcher;
    editor(shot.dataUrl, meta, sel.kind === 'element' ? meta.element.rect : sel.kind === 'area' ? meta.area : null);
  }
  function facts() {
    const ua = navigator.userAgentData;
    const chrome = ua?.brands?.find(b => /Chrome|Chromium|Edge|Opera|Brave/.test(b.brand) && !/Not/.test(b.brand));
    const w = innerWidth, h = innerHeight;
    return {
      v: 1, url: location.href, pageTitle: document.title.slice(0, 200),
      viewport: { w, h, dpr: devicePixelRatio },
      device: w < 768 || matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop',
      browser: chrome ? `${chrome.brand} ${chrome.version}` : (navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/) || ['unknown'])[0],
      os: ua?.platform || navigator.platform,
      lang: document.documentElement.lang || '',
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      createdAt: new Date().toISOString(),
    };
  }

  // ---------- 3. annotate + describe ----------
  async function editor(dataUrl, meta, mark) {
    const ctxInfo = await send({ type: 'context' }).catch(() => ({ projects: [] }));
    const img = new Image(); img.src = dataUrl; await img.decode();
    const k = img.naturalWidth / meta.viewport.w;            // css px -> image px
    const shapes = mark ? [{ t: 'rect', x: mark.x * k - 6 * k, y: mark.y * k - 6 * k, w: mark.w * k + 12 * k, h: mark.h * k + 12 * k }] : [];
    let tool = 'rect';

    const back = el('div', { class: 'back' });
    const panel = el('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fixproof' });
    const projOpts = ctxInfo.projects.map(p => `<option value="${esc(p.id)}"${ctxInfo.project?.id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const n = meta.console.filter(c => c.level === 'error').length, w = meta.console.length - n, f = meta.network.length;
    panel.innerHTML = `
      <div class="shot">
        <div class="tools" role="toolbar">
          <button data-t="rect" aria-pressed="true">▢ ${t('toolRect')}</button>
          <button data-t="arrow" aria-pressed="false">↗ ${t('toolArrow')}</button>
          <button data-t="pen" aria-pressed="false">✎ ${t('toolPen')}</button>
          <span class="sp"></span>
          <button data-undo>↶ ${t('undo')}</button>
        </div>
        <div class="canvas-wrap"><canvas width="${img.naturalWidth}" height="${img.naturalHeight}"></canvas></div>
      </div>
      <form novalidate>
        <h2>${t('newTicket')}</h2>
        ${!ctxInfo.hasToken || !ctxInfo.projects.length ? `<div class="warn">${t('noSetup')} <button type="button" data-opt>${t('openSettings')}</button></div>` : ''}
        ${ctxInfo.projects.length && !ctxInfo.project ? `<div class="warn">${t('noProject')}</div>` : ''}
        <label>${t('project')}<select name="project" required>${ctxInfo.project ? '' : '<option value="">—</option>'}${projOpts}</select></label>
        <label>${t('title')}<input type="text" name="title" required maxlength="140" placeholder="${esc(t('titlePlaceholder'))}"></label>
        <label>${t('description')}<textarea name="description" placeholder="${esc(t('descriptionPlaceholder'))}"></textarea></label>
        <div class="row">
          <label>${t('type')}<select name="type"><option value="bug">${t('typeBug')}</option><option value="design">${t('typeDesign')}</option><option value="content">${t('typeContent')}</option><option value="request">${t('typeRequest')}</option></select></label>
          <label class="check" style="align-self:end;padding-block-end:10px"><input type="checkbox" name="high"> ${t('priorityHigh')}</label>
        </div>
        <div class="ctx">${t('attached')}: <b><bdi dir="ltr">${esc(decodeURI(location.pathname))}</bdi></b>${meta.element ? ` · <b>${esc(meta.element.selector.slice(0, 80))}</b>` : ''} · <b>${meta.viewport.w}×${meta.viewport.h}</b> ${meta.device} · ${esc(meta.browser)}<br>${t('consoleErrors')}: <b>${n}</b>${w ? ` (+${w} ${t('warnings')})` : ''}${meta.catcher ? '' : ' <span title="' + esc(t('catcherOff')) + '">ⓘ</span>'} · ${t('failedRequests')}: <b>${f}</b></div>
        <p class="msg" role="status" aria-live="polite"></p>
        <div class="actions"><button type="button" class="btn ghost" data-x>${t('cancel')}</button><button type="submit" class="btn primary">${t('send')}</button></div>
      </form>`;
    back.append(panel); root.append(back);
    const cv = panel.querySelector('canvas'), g = cv.getContext('2d'), form = panel.querySelector('form'), F = form.elements, msg = panel.querySelector('.msg');
    F.title.focus();
    panel.querySelector('[data-opt]')?.addEventListener('click', () => send({ type: 'openOptions' }));
    panel.querySelector('[data-x]').addEventListener('click', close);
    panel.querySelector('.tools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-undo')) { shapes.pop(); return draw(); }
      tool = b.dataset.t; panel.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b));
    });

    const lw = Math.max(3, Math.round(3 * k));
    function draw(target = g, extra) {
      target.drawImage(img, 0, 0);
      target.strokeStyle = RED; target.fillStyle = RED; target.lineWidth = lw; target.lineCap = 'round'; target.lineJoin = 'round';
      for (const s of extra ? [...shapes, extra] : shapes) {
        target.beginPath();
        if (s.t === 'rect') { target.roundRect ? target.roundRect(s.x, s.y, s.w, s.h, 4 * k) : target.rect(s.x, s.y, s.w, s.h); target.stroke(); }
        if (s.t === 'pen') { s.pts.forEach(([x, y], i) => (i ? target.lineTo(x, y) : target.moveTo(x, y))); target.stroke(); }
        if (s.t === 'arrow') {
          const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), hd = 16 * k;
          target.moveTo(s.x1, s.y1); target.lineTo(s.x2, s.y2); target.stroke();
          target.beginPath(); target.moveTo(s.x2, s.y2);
          target.lineTo(s.x2 - hd * Math.cos(a - 0.45), s.y2 - hd * Math.sin(a - 0.45)); target.lineTo(s.x2 - hd * Math.cos(a + 0.45), s.y2 - hd * Math.sin(a + 0.45)); target.closePath(); target.fill();
        }
      }
    }
    draw();
    const pos = e => { const r = cv.getBoundingClientRect(), s = cv.width / r.width; return [(e.clientX - r.left) * s, (e.clientY - r.top) * s]; };
    let live = null;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); const [x, y] = pos(e);
      live = tool === 'rect' ? { t: 'rect', x0: x, y0: y, x, y, w: 0, h: 0 } : tool === 'arrow' ? { t: 'arrow', x1: x, y1: y, x2: x, y2: y } : { t: 'pen', pts: [[x, y]] };
    });
    cv.addEventListener('pointermove', e => {
      if (!live) return; const [x, y] = pos(e);
      if (live.t === 'rect') Object.assign(live, { x: Math.min(x, live.x0), y: Math.min(y, live.y0), w: Math.abs(x - live.x0), h: Math.abs(y - live.y0) });
      if (live.t === 'arrow') Object.assign(live, { x2: x, y2: y });
      if (live.t === 'pen') live.pts.push([x, y]);
      draw(g, live);
    });
    cv.addEventListener('pointerup', () => {
      if (live && (live.t === 'pen' ? live.pts.length > 2 : live.t === 'rect' ? live.w > 4 && live.h > 4 : Math.hypot(live.x2 - live.x1, live.y2 - live.y1) > 8)) shapes.push(live);
      live = null; draw();
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = F.title.value.trim();
      if (!F.project.value) { msg.className = 'msg err'; msg.textContent = t('needProject'); return F.project.focus(); }
      if (!title) { msg.className = 'msg err'; msg.textContent = t('needTitle'); return F.title.focus(); }
      const btn = form.querySelector('.primary'); btn.disabled = true; btn.textContent = t('sending'); msg.textContent = '';
      draw();
      const image = cv.toDataURL('image/jpeg', 0.85);
      const labels = ['status: new', 'type: ' + F.type.value, 'device: ' + meta.device, ...(F.high.checked ? ['priority: high'] : [])];
      const { catcher, ...m } = meta;
      m.reporter = ctxInfo.reporter || '';
      const strings = Object.fromEntries(['page', 'element', 'screen', 'consoleErrors', 'warnings', 'failedRequests', 'technical'].map(x => [x, t(x)]));
      try {
        const r = await send({ type: 'submit', projectId: F.project.value, ticket: { title, description: F.description.value, labels, meta: m, strings, images: [{ name: 'before.jpg', dataUrl: image }] } });
        if (r.queued) {
          // not sent yet: kept in the outbox, the extension retries by itself (MSL-102)
          msg.className = r.state === 'action' ? 'msg err' : 'msg ok';
          msg.textContent = r.state === 'action' ? `${t('queuedAction')} (${r.error})` : t('queued');
        } else {
          msg.className = 'msg ok';
          msg.innerHTML = `${esc(t('sent'))} <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.ref || '#' + r.number)} ↗</a>`;
        }
        btn.textContent = t('close'); btn.disabled = false; btn.type = 'button'; btn.onclick = close;
      } catch (err) {
        msg.className = 'msg err'; msg.textContent = t('error') + ': ' + err.message;
        btn.disabled = false; btn.textContent = t('send');
      }
    });
  }
})();
