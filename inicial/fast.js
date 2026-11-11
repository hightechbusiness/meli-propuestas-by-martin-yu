/* Modo Fast de la edición inicial: elegí zona, categoría (1 a 5) y round, y sale un flyer con todas las tasas y plazos.
   Usa sólo las condiciones aprobadas de esta edición (presets.js). Todo se dibuja en este navegador; no envía datos. */
(function (root) {
  'use strict';
  const ZONE_ORDER = ['resto', 'bsas', 'santafe', 'rionegro', 'chaco', 'catamarca', 'larioja'];
  const ZONE_LABEL = { resto: 'Resto del país', bsas: 'Bs. As. · Chubut · Córdoba · Entre Ríos', santafe: 'Santa Fe', rionegro: 'Río Negro', chaco: 'Chaco · San Juan · Santa Cruz · Sgo. del Estero', catamarca: 'Catamarca · Formosa · Mendoza', larioja: 'La Rioja' };
  const METHOD = { debit: 'Tarjeta de débito', credit: 'Tarjeta de crédito', prepaid: 'Tarjeta prepaga', money: 'Dinero en cuenta', consumer: 'Cuotas sin tarjeta' };
  const ok = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const r2 = v => Math.round(v * 100) / 100;
  const termLabel = t => t === '0d' ? 'Al momento' : `${parseInt(t, 10)} días`;
  const pctText = v => ok(v) ? v.toFixed(2).replace('.', ',') + '%' : '—';

  function zones(P) {
    const groups = P.GROUPS || {};
    return ZONE_ORDER.map(group => {
      const keys = P.PROVINCES.filter(p => groups[p.id] === group);
      if (!keys.length) return null;
      const rep = group === 'resto' && keys.some(k => k.id === 'caba') ? 'caba' : keys[0].id;
      return { group, rep, label: ZONE_LABEL[group], provinces: keys.map(k => k.label) };
    }).filter(Boolean);
  }

  // Tabla completa a partir de los presets públicos. Pura: sin DOM, testeable.
  function sheet(P, sel) {
    const zone = zones(P).find(z => z.group === sel.group) || zones(P)[0];
    const cat = P.CATEGORIES.some(c => c.id === sel.cat) ? sel.cat : 'c1';
    const tax = sel.iva === true ? 1.21 : 1, show = v => ok(v) ? r2(v * tax) : null;
    const rel = ['0', '1', '2', '3'].map(r => P.getPoint(cat, zone.rep, r));
    if (rel.some(x => !x)) throw new Error('No hay condiciones para esta zona y categoría.');
    // Tasa de lista (Cat. 1, misma zona y plazo) tachada: sólo si se pide y si la propuesta es menor.
    const refOn = sel.showRef !== false, base = ['0', '1', '2', '3'].map(r => P.getPoint('c1', zone.rep, r));
    const row = (term, val, refVal) => ({ term, rate: show(val), ref: refOn && ok(val) && ok(refVal) && refVal > val + 1e-9 ? show(refVal) : null });
    const point = [
      { method: 'debit', rows: [row('0d', rel[0].debit.rate, base[0].debit.rate), row('2d', rel[1].debit.rate, base[1].debit.rate)] },
      { method: 'credit', rows: [row('0d', rel[0].credit.rate, base[0].credit.rate), row('5d', rel[2].credit.rate, base[2].credit.rate), row('10d', rel[3].credit.rate, base[3].credit.rate)] },
      { method: 'prepaid', rows: [row('0d', rel[0].prepaid.rate, base[0].prepaid.rate), row('3d', rel[2].prepaid.rate, base[2].prepaid.rate)] }
    ];
    let qr = null;
    if (sel.qr !== false) {
      const choices = P.getQRChoices(cat, zone.rep), baseQR = P.getQRChoices('c1', zone.rep); qr = [];
      for (const method of ['money', 'debit', 'credit', 'consumer']) {
        const rows = choices.filter(ch => ch.id.startsWith(method + '-')).map(ch => row(ch.id.split('-')[1], ch.rate, (baseQR.find(b => b.id === ch.id) || {}).rate));
        if (rows.length) qr.push({ method, rows });
      }
    }
    const round = P.ROUNDS.some(r => r.id === sel.round) ? sel.round : 'none';
    const fin = round === 'none' ? null : P.getFinancing(round).map(f => ({ n: f.count, rate: show(f.additional) }));
    return { group: zone.group, long: false, eco: false, cat, round, iva: sel.iva === true, point, qr, fin, link: null, tci: null,
      catLabel: (P.CATEGORIES.find(c => c.id === cat) || {}).label || '', roundLabel: round === 'none' ? 'Sin cuotas' : (P.ROUNDS.find(r => r.id === round) || {}).label || round };
  }

  function messageText(sh, info) {
    const lines = [`Hola${info.client ? ' ' + info.client : ''}. Te comparto las tasas de Mercado Pago.`, ''];
    const block = (title, groups) => { lines.push(title); for (const g of groups) lines.push(`• ${METHOD[g.method]}: ` + g.rows.map(r => `${termLabel(r.term).toLowerCase()} ${pctText(r.rate)}${r.ref ? ` (antes ${pctText(r.ref)})` : ''}`).join(' · ')); lines.push(''); };
    block('POINT', sh.point);
    if (sh.qr) block('CÓDIGO QR', sh.qr);
    if (sh.fin) { lines.push('CUOTAS POINT'); lines.push(sh.fin.map(f => `${f.n}: ${pctText(f.rate)}`).join(' · ')); lines.push(''); }
    lines.push(`Tasas ${sh.iva ? 'con IVA 21% incluido' : 'sin IVA'}.${info.iibbNote ? ' No incluye IIBB ni retenciones.' : ''} Los días son corridos.`);
    if (info.validity) lines.push(`Válida hasta ${info.validity}. Sujeta a condiciones comerciales.`);
    const contact = [info.advisor, info.advisorEmail, info.advisorPhone].filter(Boolean).join(' · ');
    if (contact) lines.push('', contact);
    return lines.join('\n');
  }

  // ---------- Flyer A4 (1240 × 1754, 150 dpi) ----------
  const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
  const W = 1240, H = 1754, M = 60, INK = '#0a2540', MUTED = '#5f7686', LINE = '#e3eaef', YELLOW = '#ffe600', NAVY = '#002b49';
  function render(canvas, sh, info = {}) {
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d'); if (!c) throw new Error('Canvas no disponible.');
    c.textBaseline = 'top';
    const font = (s, w = 400) => `${w} ${s}px ${FONT}`;
    const text = (v, x, y, s, color = INK, w = 400, align = 'left') => { c.font = font(s, w); c.fillStyle = color; const width = c.measureText(v).width; c.fillText(v, align === 'right' ? x - width : align === 'center' ? x - width / 2 : x, y); return width; };
    const fit = (v, max, s, min, w) => { let z = s; c.font = font(z, w); while (z > min && c.measureText(v).width > max) { z--; c.font = font(z, w); } return z; };
    const box = (x, y, w, h, r, fill, stroke) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } };
    const strike = (v, xRight, y, s) => { const wv = text(v, xRight, y, s, '#8aa0ad', 500, 'right'); c.fillStyle = '#8aa0ad'; c.fillRect(xRight - wv, y + s * .55, wv, 1.6); return wv; };
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    c.fillStyle = YELLOW; c.fillRect(0, 0, W, 200);
    box(M, 46, 250, 108, 18, '#ffffff');
    if (info.logo && info.logo.complete && info.logo.naturalWidth) { const lw = 214, lh = lw * info.logo.naturalHeight / info.logo.naturalWidth; c.drawImage(info.logo, M + 18, 46 + (108 - lh) / 2, lw, lh); }
    else text('Mercado Pago', M + 125, 86, 28, NAVY, 800, 'center');
    // Encabezado que le habla al comercio: título, para quién y qué incluye.
    const maxW = W - M * 2 - 285, title = 'Cobrá más fácil con Mercado Pago';
    text(title, M + 285, 48, fit(title, maxW, 46, 28, 800), INK, 800);
    const detail = ['Point', sh.qr ? 'QR' : null, sh.fin ? 'Cuotas' : null, info.validity ? 'Válida hasta el ' + info.validity.slice(0, 5) : null].filter(Boolean).join(' · ');
    if (info.client) { const who = 'Para ' + info.client; text(who, M + 285, 104, fit(who, maxW, 34, 20, 800), INK, 800); text(detail, M + 285, 152, fit(detail, maxW, 18, 12, 600), '#3d4f5c', 600); }
    else text(detail, M + 285, 114, fit(detail, maxW, 24, 14, 650), INK, 650);
    let y = 232;
    text('Costos de procesamiento', M, y, 34, INK, 800);
    text(sh.iva ? 'IVA 21% incluido' : 'Tasas sin IVA', W - M, y + 8, 20, NAVY, 700, 'right');
    y += 48; text('Los días son corridos, no hábiles.', M, y, 18, MUTED, 400); y += 40;
    const table = (x, top, w, heading, groups) => {
      const rowH = 50, headH = 64; let at = top;
      box(x, at, w, headH, 18, '#eef3f6'); text(heading, x + 26, at + 18, 24, INK, 800); at += headH;
      for (const g of groups) {
        const h = rowH * g.rows.length, label = METHOD[g.method];
        text(label, x + 22, at + h / 2 - 11, fit(label, w * .38, 19, 13, 700), INK, 700);
        g.rows.forEach((r, i) => { const ry = at + i * rowH; text(termLabel(r.term), x + w * .44, ry + 15, 18, MUTED, 400); const rw = text(pctText(r.rate), x + w - 24, ry + 11, 24, INK, 800, 'right'); if (r.ref) strike(pctText(r.ref), x + w - 24 - rw - 12, ry + 16, 16); if (i < g.rows.length - 1) { c.fillStyle = LINE; c.fillRect(x + w * .42, ry + rowH - 1, w * .58 - 16, 1); } });
        at += h; c.fillStyle = LINE; c.fillRect(x + 12, at - 1, w - 24, 1.5);
      }
      box(x, top, w, at - top + 6, 18, null, LINE);
      return at + 6;
    };
    const finList = (x, top, w) => {
      box(x, top, w, 64, 18, '#eef3f6'); text('CUOTAS POINT', x + 26, top + 18, 22, INK, 800);
      let at = top + 64; const rh = 50;
      sh.fin.forEach((f, i) => { const ry = at + i * rh; text(`${f.n} cuotas`, x + 22, ry + 14, 19, INK, 600); text(pctText(f.rate), x + w - 24, ry + 11, 24, INK, 800, 'right'); if (i < sh.fin.length - 1) { c.fillStyle = LINE; c.fillRect(x + 12, ry + rh - 1, w - 24, 1); } });
      at += rh * sh.fin.length; box(x, top, w, at - top + 6, 18, null, LINE); return at + 6;
    };
    const colW = (W - M * 2 - 30) / 2;
    const leftEnd = table(M, y, colW, 'POINT', sh.point);
    let rightEnd = y;
    if (sh.qr) rightEnd = table(M + colW + 30, y, colW, 'CÓDIGO QR', sh.qr);
    else if (sh.fin) rightEnd = finList(M + colW + 30, y, colW);
    y = Math.max(leftEnd, rightEnd) + 36;
    if (sh.fin && sh.qr) {
      text('Costos de financiación Point', M, y, 28, INK, 800); text('Tasa directa adicional al procesamiento', W - M, y + 8, 17, MUTED, 400, 'right'); y += 48;
      const cw = (W - M * 2 - 40) / 3, ch = 78;
      sh.fin.forEach((f, i) => { const x = M + (i % 3) * (cw + 20), yy = y + Math.floor(i / 3) * (ch + 14); box(x, yy, cw, ch, 16, '#f4f8fa', LINE); text(`${f.n} cuotas`, x + 22, yy + 26, 20, MUTED, 600); text(pctText(f.rate), x + cw - 22, yy + 20, 30, INK, 800, 'right'); });
      y += ch * 2 + 14 + 34;
    }
    const fy = H - 150; c.fillStyle = NAVY; c.fillRect(0, fy, W, 150); c.fillStyle = YELLOW; c.fillRect(0, fy, W, 6);
    const contact = [info.advisor, info.advisorEmail, info.advisorPhone].filter(Boolean).join(' · ') || 'Mercado Pago';
    text(contact, M, fy + 34, fit(contact, W * .6, 22, 14, 700), '#ffffff', 700);
    text(`${sh.iva ? 'IVA 21% incluido.' : 'Tasas sin IVA.'}${info.iibbNote ? ' No incluye IIBB ni retenciones.' : ''}`, M, fy + 76, 17, '#c9e9fa', 400);
    if (info.validity) text(`Válida hasta ${info.validity} · Sujeta a condiciones comerciales`, W - M, fy + 36, 18, '#ffffff', 600, 'right');
    text('Martin Yu', W - M, fy + 104, 14, '#9fc3d8', 400, 'right');
    return { width: W, height: H, overflow: y > fy };
  }

  // ---------- Interfaz ----------
  const KEY = 'meli-propuestas-inicial-fast-v1', MODE = 'meli-propuestas-inicial-modo-v1';
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* opcional */ } } };
  const defaults = { group: 'resto', cat: 'c3', round: 'r4', iva: false, qr: true, showRef: true, days: 7, iibbNote: false, clientOn: false, client: '', advOn: false, advName: '', advEmail: '', advPhone: '' };
  function loadSel() { try { return { ...defaults, ...(JSON.parse(store.get(KEY) || '{}') || {}) }; } catch (_) { return { ...defaults }; } }
  const plusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  const esc = v => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function init() {
    const host = document.getElementById('fastPublicRoot'), P = root.PublicRatePresets;
    if (!host || !P || !root.PublicDemoPDF) return;
    let sel = loadSel(); const logo = new Image(); logo.onload = () => paint(); logo.src = './logo.png';
    const chips = (name, options, value) => `<div class="fast-chips" role="radiogroup" aria-label="${esc(name)}">${options.map(o => `<button type="button" class="fast-chip${String(o.v) === String(value) ? ' is-on' : ''}" role="radio" aria-checked="${String(o.v) === String(value)}" data-fast="${esc(name)}" data-value="${esc(o.v)}"${o.title ? ` title="${esc(o.title)}"` : ''}>${esc(o.l)}</button>`).join('')}</div>`;
    function view() {
      const z = zones(P);
      host.innerHTML = `
        <div class="fast-layout">
          <div class="fast-card">
            <p class="fast-kicker">⚡ MODO FAST</p><h2 class="fast-title">Todas las tasas, en un flyer.</h2>
            <p class="fast-lead">Elegí tres cosas y descargá. Para armar una propuesta a medida, pasá al modo experto.</p>
            <div class="fast-step"><span>1</span><strong>Zona</strong></div>
            ${chips('group', z.map(x => ({ v: x.group, l: x.label, title: x.provinces.join(', ') })), sel.group)}
            <p class="fast-hint">${esc((z.find(x => x.group === sel.group) || { provinces: [] }).provinces.join(', '))}</p>
            <div class="fast-step"><span>2</span><strong>Categoría</strong></div>
            ${chips('cat', P.CATEGORIES.map(c => ({ v: c.id, l: c.label, title: c.range })), sel.cat)}
            <div class="fast-step"><span>3</span><strong>Cuotas</strong></div>
            ${chips('round', [{ v: 'none', l: 'Sin cuotas' }].concat(P.ROUNDS.map(r => ({ v: r.id, l: r.label }))), sel.round)}
            <div class="fast-toggles">
              <label><input type="checkbox" data-fast-toggle="qr"${sel.qr ? ' checked' : ''}> Mostrar QR</label>
              <label><input type="checkbox" data-fast-toggle="iva"${sel.iva ? ' checked' : ''}> + IVA 21%</label>
              <label title="Muestra la tasa de lista (Cat. 1) tachada al lado, sólo si es más alta"><input type="checkbox" data-fast-toggle="showRef"${sel.showRef !== false ? ' checked' : ''}> Lista tachada</label>
            </div>
            <div class="fast-step"><span>4</span><strong>Vigencia</strong></div>
            ${chips('days', [5, 7, 10, 15].map(n => ({ v: n, l: n + ' días' })), sel.days)}
            <div class="fast-step"><span>5</span><strong>Opcional</strong></div>
            <div class="fast-optional">
              <label><input type="checkbox" data-fast-toggle="clientOn"${sel.clientOn ? ' checked' : ''}> Poner el nombre del comercio</label>
              <div class="fast-fields"${sel.clientOn ? '' : ' hidden'}><input type="text" maxlength="80" placeholder="Ej. Almacén de la esquina" data-fast-field="client" value="${esc(sel.client)}" aria-label="Nombre del comercio"></div>
              <label><input type="checkbox" data-fast-toggle="advOn"${sel.advOn ? ' checked' : ''}> Agregar mis datos de contacto</label>
              <div class="fast-fields"${sel.advOn ? '' : ' hidden'}><input type="text" maxlength="70" placeholder="Tu nombre" data-fast-field="advName" value="${esc(sel.advName)}" aria-label="Tu nombre"><input type="email" maxlength="100" placeholder="tu@mail.com" data-fast-field="advEmail" value="${esc(sel.advEmail)}" aria-label="Tu mail"><input type="tel" maxlength="40" placeholder="Teléfono / WhatsApp" data-fast-field="advPhone" value="${esc(sel.advPhone)}" aria-label="Tu teléfono"></div>
              <label><input type="checkbox" data-fast-toggle="iibbNote"${sel.iibbNote ? ' checked' : ''}> Mostrar leyenda “No incluye IIBB ni retenciones”</label>
            </div>
            <div class="fast-actions">
              <button type="button" class="primary-button" data-fast-action="png">Descargar PNG</button>
              <button type="button" class="primary-button" data-fast-action="pdf">Descargar PDF</button>
              <button type="button" class="whatsapp-button" data-fast-action="wa">WhatsApp</button>
            </div>
            <p class="team-access"><a class="team-access-link" href="https://propuestas-que-conectan.pages.dev/" rel="noopener">Acceso al equipo · Modo Fast con todas las tasas <span aria-hidden="true">→</span></a><small>Con tu cuenta @mercadolibre.com.</small></p>
            <p class="fast-status" role="status" aria-live="polite"></p>
          </div>
          <div class="fast-preview"><canvas id="fastPublicCanvas" width="1240" height="1754" aria-label="Flyer con todas las tasas"></canvas><p class="fast-hint">Se genera en tu navegador. No se envían datos.</p></div>
        </div>`;
      paint();
    }
    const current = () => sheet(P, sel);
    const info = () => ({ logo, client: sel.clientOn ? sel.client.trim() : '', advisor: sel.advOn ? sel.advName.trim() : '', advisorEmail: sel.advOn ? sel.advEmail.trim() : '', advisorPhone: sel.advOn ? sel.advPhone.trim() : '', iibbNote: sel.iibbNote === true, showCat: false, validity: plusDays(Number(sel.days) || 7) });
    function paint() { const cv = document.getElementById('fastPublicCanvas'); if (!cv) return; try { render(cv, current(), info()); status(''); } catch (e) { status(e.message); } }
    function status(msg) { const el = host.querySelector('.fast-status'); if (el) el.textContent = msg; }
    const save = () => store.set(KEY, JSON.stringify(sel));
    const name = () => `tasas-mercado-pago-${new Date().toISOString().slice(0, 10)}`;
    const canvas = () => document.getElementById('fastPublicCanvas');
    const blobPNG = () => new Promise((res, rej) => canvas().toBlob(b => b ? res(b) : rej(new Error('No se pudo generar la imagen.')), 'image/png'));
    const download = (blob, file) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };
    const jpeg = () => { const data = canvas().toDataURL('image/jpeg', .92).split(',')[1], raw = atob(data), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; };
    async function act(kind) {
      try {
        paint();
        if (kind === 'png') { download(await blobPNG(), name() + '.png'); status('Flyer PNG listo.'); }
        if (kind === 'pdf') { const pdf = root.PublicDemoPDF.imagePDF(jpeg(), canvas().width, canvas().height); download(new Blob([pdf], { type: 'application/pdf' }), name() + '.pdf'); status('PDF listo.'); }
        if (kind === 'wa') {
          const text = messageText(current(), info()), blob = await blobPNG(), file = new File([blob], name() + '.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text });
          else { download(blob, name() + '.png'); window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); status('Se descargó el PNG para adjuntarlo en WhatsApp.'); }
        }
      } catch (e) { if (e && e.name === 'AbortError') return; status(e.message || 'No se pudo completar la acción.'); }
    }
    host.addEventListener('click', e => {
      const chip = e.target.closest('[data-fast]'), action = e.target.closest('[data-fast-action]');
      if (chip) { const k = chip.dataset.fast, v = chip.dataset.value; sel[k] = k === 'days' ? Number(v) : v; save(); view(); }
      if (action) act(action.dataset.fastAction);
    });
    host.addEventListener('change', e => { const t = e.target.closest('[data-fast-toggle]'); if (!t) return; sel[t.dataset.fastToggle] = t.checked; save(); view(); });
    host.addEventListener('input', e => { const f = e.target.closest('[data-fast-field]'); if (!f) return; sel[f.dataset.fastField] = f.value; save(); paint(); });
    view();
    // Modo Fast / Modo experto: el formulario actual (#generador) es el modo experto.
    const fast = document.getElementById('fastInicial'), expert = document.getElementById('generador');
    const tabs = [...document.querySelectorAll('[data-inicial-mode]')];
    const setMode = mode => { const isFast = mode !== 'expert'; fast.hidden = !isFast; expert.hidden = isFast; tabs.forEach(t => { const on = (t.dataset.inicialMode === 'fast') === isFast; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); }); store.set(MODE, isFast ? 'fast' : 'expert'); };
    tabs.forEach(t => t.addEventListener('click', () => setMode(t.dataset.inicialMode)));
    const wantsExpert = location.hash === '#generador' || store.get(MODE) === 'expert';
    setMode(wantsExpert ? 'expert' : 'fast');
    window.addEventListener('hashchange', () => { if (location.hash === '#generador') setMode('expert'); });
    document.addEventListener('click', e => { const a = e.target.closest('a[href="#generador"]'); if (a) setMode('expert'); });
  }

  root.PublicFastMode = Object.freeze({ zones, sheet, messageText, render, init });
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
