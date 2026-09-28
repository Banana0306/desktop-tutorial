/* 瑞城排車台 前端 */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const { VEH, MODE, tmin, fmtT } = RC;
  const KIND = { car: '汽車', m1: '機車', m2: '機車' };
  const WEEK = '日一二三四五六';
  const fmtDur = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + ' 小時 ' + (m % 60) + ' 分' : m + ' 分'; };
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const hhmm = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }); };
  const mmdd = d => { const [y, mo, da] = d.split('-').map(Number); return mo + '/' + da + '（' + WEEK[new Date(y, mo - 1, da).getDay()] + '）'; };
  const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const normT = t => { const m = tmin(t); return m == null ? '' : fmtT(m); };
  const normCode = c => String(c || '').toUpperCase().replace(/[\s\-_]/g, '');
  const weekday = d => { const [y, m, da] = d.split('-').map(Number); return new Date(y, m - 1, da).getDay(); };

  const S = { me: null, date: today(), stops: [], fleet: null, suppliers: [], customers: null, view: 'dispatch', drv: 'm1',
    failFor: null, confirmDel: null, copyFor: null, photo: { files: [], review: null, busy: false },
    matrix: null, matrixKey: '', routes: {}, gmapsReady: false, map: null, mapObjs: [], cDirty: {}, sDirty: {}, cRows: [], poll: null };

  // ---------- API ----------
  async function api(path, opt = {}) {
    const o = { method: opt.method || 'GET', headers: {} };
    if (opt.body instanceof FormData) o.body = opt.body;
    else if (opt.body !== undefined) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opt.body); }
    const r = await fetch('/api' + path, o);
    let data = null; try { data = await r.json(); } catch { }
    if (r.status === 401) { showLogin(); throw new Error(data && data.error || '請先登入'); }
    if (!r.ok) throw new Error(data && data.error || ('錯誤 ' + r.status));
    return data;
  }
  let msgTimer = {};
  function flash(sel, t, err) { const m = $(sel); if (!m) return; m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); clearTimeout(msgTimer[sel]); if (t) msgTimer[sel] = setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 8000); }
  function busy(sel, t) { const m = $(sel); if (!m) return; m.className = 'msg'; m.innerHTML = '<span class="spin"></span>' + esc(t); clearTimeout(msgTimer[sel]); }

  // ---------- 登入 ----------
  function showLogin() { $('#view-login').hidden = false; $('#top').hidden = true; document.querySelectorAll('main').forEach(m => m.hidden = true); if (S.poll) { clearInterval(S.poll); S.poll = null; } }
  $('#l-go').addEventListener('click', login);
  $('#l-pin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  async function login() {
    const pin = $('#l-pin').value.trim(); if (!pin) return;
    try { await api('/login', { method: 'POST', body: { pin } }); $('#l-pin').value = ''; await boot(); }
    catch (e) { $('#l-msg').textContent = e.message; }
  }
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => { }); location.reload(); });

  async function boot() {
    let me; try { me = await api('/me'); } catch { showLogin(); return; }
    S.me = me;
    $('#view-login').hidden = true; $('#top').hidden = false;
    $('#who').textContent = (me.name ? me.name + '・' : '') + (me.roleName || '');
    const tabs = me.canDispatch ? [['dispatch', '排車'], ['driver', '司機畫面'], ['customers', '客戶'], ['suppliers', '供應商'], ['settings', '設定']].concat(me.isOwner ? [['users', '使用者']] : []) : [['driver', '我的路線'], ['settings', '設定']];
    S.view = me.canDispatch ? 'dispatch' : 'driver';
    if (me.veh && VEH.includes(me.veh)) S.drv = me.veh;
    $('#tabs').innerHTML = tabs.map(([v, n]) => `<button role="tab" data-view="${v}" aria-selected="${v === S.view}">${n}</button>`).join('');
    $('#date').value = S.date;
    await refresh();
    if (me.canDispatch && me.googleKey) GM.load(me.googleKey).then(() => { S.gmapsReady = true; renderBoard(); }).catch(e => setBanner('bad', 'Google 地圖載入失敗：' + e.message + '。請檢查金鑰與網域限制。'));
    if (S.poll) clearInterval(S.poll);
    S.poll = setInterval(() => refresh().catch(() => { }), 30000);
  }
  async function refresh() {
    const st = await api('/state?date=' + S.date);
    S.stops = st.stops; S.fleet = st.fleet; S.suppliers = st.suppliers || []; S.customers = st.customers;
    render();
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; S.failFor = null; render(); });
  $('#date').addEventListener('change', e => { if (!e.target.value) return; S.date = e.target.value; S.matrix = null; S.routes = {}; refresh(); });

  // ---------- 衍生 ----------
  const vStops = v => S.stops.filter(s => s.veh === v).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const pendingOf = v => vStops(v).filter(s => s.status === 'pending');
  const lastFixed = v => { const f = vStops(v).filter(s => s.status !== 'pending'); return f[f.length - 1] || null; };
  const lastDone = v => vStops(v).filter(s => s.done_at).sort((a, b) => a.done_at < b.done_at ? 1 : -1)[0] || null;
  const vName = v => (S.fleet && S.fleet.names[v]) || KIND[v];
  const byId = id => S.stops.find(x => x.id === id);
  const partnerOf = s => s.needs ? byId(s.needs) : S.stops.find(x => x.needs === s.id);
  const dayStart = () => tmin(S.fleet && S.fleet.start) ?? 570;
  const nowMin = () => { if (S.date !== today()) return null; const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const hoursTxt = s => (s.open || s.close) ? `${s.open || '?'}–${s.close || '?'}` : '';
  const isClosedToday = s => String(s.closed_days || '').split(',').map(x => x.trim()).includes(String(weekday(S.date)));
  function ctx() {
    const f = S.fleet || {};
    const per = f.perStop || { car: 8, m1: 5, m2: 5 };
    const sorted = S.stops.slice().sort((a, b) => a.id < b.id ? -1 : 1);
    const index = new Map(); sorted.forEach((s, i) => index.set(s.id, i + 1));
    const key = S.date + '|' + sorted.map(s => s.id + ':' + s.lat + ',' + s.lng).join(';');
    return { warehouse: S.me.warehouse, matrix: S.matrixKey === key ? S.matrix : null, index, perStop: { car: per.car, m1: per.m1 ?? per.moto, m2: per.m2 ?? per.moto }, motoRadiusKm: f.motoRadiusKm || 10, key };
  }
  let PLANS = {};
  function computePlans() { const c = ctx(); PLANS = {}; VEH.forEach(v => PLANS[v] = RC.planOf(c, v, vStops(v), dayStart(), nowMin())); PLANS.est = !c.matrix; }

  // ---------- 渲染 ----------
  function render() {
    if (!S.me) return;
    computePlans();
    document.querySelectorAll('main').forEach(m => m.hidden = true);
    $('#view-' + S.view).hidden = false;
    document.querySelectorAll('#tabs [data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === S.view));
    if (S.view === 'dispatch') { renderBanner(); renderUnassigned(); renderBoard(); renderSupSelect(); if (document.activeElement !== $('#s-start')) $('#s-start').value = S.fleet.start || '09:30'; $('#r-radius').textContent = S.fleet.motoRadiusKm || 10; }
    else if (S.view === 'driver') renderDriver();
    else if (S.view === 'customers') { if (S.renderedView !== 'customers') loadCustomers(); }
    else if (S.view === 'suppliers') { if (S.renderedView !== 'suppliers' || !Object.keys(S.sDirty).length) renderSuppliers(); }
    else if (S.view === 'settings') { if (S.renderedView !== 'settings') renderSettings(); }
    else if (S.view === 'users') { if (S.renderedView !== 'users') loadUsers(); }
    S.renderedView = S.view;
  }
  function setBanner(kind, text, btn) { const b = $('#banner'); b.dataset.extra = JSON.stringify({ kind, text, btn }); renderBanner(); }
  function renderBanner() {
    let h = '';
    if (!S.me.googleKey) h += `<div class="banner bad">還沒設定 Google 地圖金鑰（GOOGLE_MAPS_BROWSER_KEY），現在的距離和時間是直線估算，見 README。</div>`;
    if (!S.me.ocr) h += `<div class="banner">還沒設定 ANTHROPIC_API_KEY，照片辨識停用。可以把照片傳給 Claude 對話，再貼 JSON 進來。</div>`;
    if (S.customers && S.customers.n === 0) h += `<div class="banner info">客戶檔是空的。先到「客戶」匯入 ERP 的客戶資料，拍照時才能自動帶入地址和營業時間。</div>`;
    const noGeo = S.stops.filter(s => s.lat == null && s.status === 'pending').length;
    if (noGeo && S.gmapsReady) h += `<div class="banner"><span>有 ${noGeo} 站還沒有座標，排車時會先轉座標。</span></div>`;
    if (PLANS.est && S.stops.some(s => s.status === 'pending' && s.veh)) h += `<div class="banner info"><span>目前顯示的時間是估算值。按「用 Google 排車」或「只更新時間」取得 Google 車程。</span><button class="btn sm" id="retime">只更新時間</button></div>`;
    try { const ex = JSON.parse($('#banner').dataset.extra || 'null'); if (ex) h += `<div class="banner ${ex.kind}">${esc(ex.text)}</div>`; } catch { }
    $('#banner').innerHTML = h;
  }
  function stopPills(s, row) {
    let p = '';
    if (s.kind === 'pickup') p += `<span class="pill pick">取貨</span>`;
    if (s.customer_code) p += `<span class="pill">${esc(s.customer_code)}</span>`;
    if (hoursTxt(s)) p += `<span class="pill">營業 ${esc(hoursTxt(s))}</span>`;
    if (s.lat == null) p += `<span class="pill fail">沒座標</span>`;
    if (s.bulky) p += `<span class="pill">大件</span>`;
    if (s.urgent) p += `<span class="pill urg">急件</span>`;
    if (s.status === 'pending' && row) {
      p += `<span class="pill eta">${s.eta ? esc(s.eta) : '約 ' + fmtT(row.eta)}</span>`;
      if (row.late > 0) p += `<span class="pill fail">晚到 ${Math.round(row.late)} 分・已打烊</span>`;
      else if (row.wait >= 10) p += `<span class="pill warn">等開門 ${fmtDur(row.wait)}</span>`;
    }
    if (s.status === 'done') p += `<span class="pill ok">${s.kind === 'pickup' ? '已取貨' : '已送達'} ${esc(hhmm(s.done_at))}</span>`;
    if (s.status === 'fail') p += `<span class="pill fail">未完成・${esc(s.note || '')} ${esc(hhmm(s.done_at))}</span>`;
    const pr = partnerOf(s);
    if (s.needs && pr && pr.status === 'pending' && (pr.veh !== s.veh || (pr.seq || 0) > (s.seq || 0))) p += `<span class="pill fail">取貨站要排在前面、同一台車</span>`;
    return p;
  }
  const linkLine = s => { const pr = partnerOf(s); if (!pr) return ''; return s.kind === 'pickup' ? `<div class="sub">→ 取完送到 ${esc(pr.shop)}</div>` : `<div class="sub">← 先到 ${esc(pr.shop)} 取貨</div>`; };
  const vehSelect = s => `<select data-act="setveh" data-id="${esc(s.id)}" aria-label="換車">${[['', '未分配']].concat(VEH.map(v => [v, vName(v)])).map(([v, n]) => `<option value="${v}"${s.veh === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const delBtn = s => S.confirmDel === s.id
    ? `<button class="btn sm urgent" data-act="del" data-id="${esc(s.id)}">${partnerOf(s) ? '連同取貨一起刪' : '確定刪除'}</button>`
    : `<button class="icon danger" data-act="del" data-id="${esc(s.id)}" title="刪除" aria-label="刪除">✕</button>`;

  function renderUnassigned() {
    const u = S.stops.filter(s => !s.veh && s.status === 'pending');
    $('#unassigned').innerHTML = u.length ? `<div class="lbl">未分配 ${u.length} 筆</div><div class="unassigned">${u.map(s => `
      <div class="u-item"><div class="grow"><div class="shop">${esc(s.shop)}</div><div class="sub">${esc(s.addr)}</div>${linkLine(s)}<div class="pills">${stopPills(s)}</div></div>${vehSelect(s)}${delBtn(s)}</div>`).join('')}</div>` : `<p class="hint">沒有待分配的訂單。</p>`;
  }
  function mapsDir(origin, dest, way) {
    let u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving';
    if (origin) u += '&origin=' + encodeURIComponent(origin);
    u += '&destination=' + encodeURIComponent(dest);
    if (way && way.length) u += '&waypoints=' + encodeURIComponent(way.join('|'));
    return u;
  }
  function mapsSegments(v) {
    const list = vStops(v), pend = list.filter(s => s.status === 'pending'), offset = list.length - pend.length, lf = lastFixed(v);
    const segs = []; let origin = lf ? lf.addr : S.me.warehouse.addr;
    for (let i = 0; i < pend.length; i += 4) {
      const chunk = pend.slice(i, i + 4);
      segs.push({ from: offset + i + 1, to: offset + i + chunk.length, url: mapsDir(origin, chunk[chunk.length - 1].addr, chunk.slice(0, -1).map(s => s.addr)) });
      origin = chunk[chunk.length - 1].addr;
    }
    return segs;
  }
  function renderBoard() {
    const cards = VEH.map(v => {
      const list = vStops(v), pend = list.filter(s => s.status === 'pending'), pl = PLANS[v];
      const done = list.length - pend.length, on = S.fleet.active[v] !== false, ld = lastDone(v);
      const lastTxt = ld ? `最後回報 <span class="num">${esc(hhmm(ld.done_at))}</span>・${esc(ld.shop)}${ld.status === 'fail' ? '（未完成）' : ''}` : (list.length ? '尚未回報' : '');
      const R = S.routes[v];
      const kmTxt = R ? R.totalKm.toFixed(1) : pl.kmAll.toFixed(1);
      return `<article class="veh${on ? '' : ' off'}" style="--vc:var(--${v})">
        <div class="veh-h">
          <div class="veh-name"><h3>${esc(vName(v))}</h3><span class="kind">${KIND[v]}${v === 'car' ? '・汽車路線' : '・機車路線'}</span>
            <button class="toggle" data-act="active" data-v="${v}" aria-pressed="${on}">${on ? '今日出車' : '今日休'}</button></div>
          <div class="stats"><span><b class="num">${list.length}</b>站</span><span>${PLANS.est && !R ? '約' : ''} <b class="num">${kmTxt}</b>km</span>${pend.length ? `<span>回倉 <b class="num">${fmtT(pl.end)}</b></span>` : ''}</div>
          <div class="bar" aria-label="完成進度"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>
          <div class="last">${list.length ? `<span class="num">${done}/${list.length}</span> 完成　` : ''}${lastTxt}</div>
        </div>
        <ol class="stops">${list.length ? list.map((s, i) => {
          const pi = pend.indexOf(s);
          return `<li class="stop${s.status !== 'pending' ? ' done' : ''}${s.kind === 'pickup' ? ' pickup' : ''}">
            <span class="seq">${i + 1}</span>
            <div><div class="shop">${esc(s.shop)}${s.phone ? ` <span class="sub">${esc(s.phone)}</span>` : ''}</div>${linkLine(s)}<div class="sub">${esc(s.addr)}</div><div class="sub">${esc(s.items)}</div><div class="pills">${stopPills(s, pl.rows[s.id])}</div></div>
            <div class="ctl">${s.status === 'pending' ? `<div class="mv">
              <button class="icon" data-act="up" data-id="${esc(s.id)}" ${pi <= 0 ? 'disabled' : ''} aria-label="往前">↑</button>
              <button class="icon" data-act="down" data-id="${esc(s.id)}" ${pi >= pend.length - 1 ? 'disabled' : ''} aria-label="往後">↓</button>
              ${delBtn(s)}</div>${vehSelect(s)}` : `<button class="btn sm" data-act="undo" data-id="${esc(s.id)}">改回未完成</button>`}</div>
          </li>`;
        }).join('') : `<li class="empty">${on ? '還沒有排到這台車。' : '今日不出車，排車會略過。'}</li>`}</ol>
        ${pend.length ? `<div class="veh-f">
          <div class="lbl">Google 地圖導航（每段 4 站）</div>
          <div class="nav">${mapsSegments(v).map(g => `<a href="${esc(g.url)}" target="_blank" rel="noopener">第 ${g.from}–${g.to} 站</a>`).join('')}</div>
          <button class="btn" data-act="copy" data-v="${v}">複製路線傳 LINE</button>
          ${S.copyFor === v ? `<textarea class="copybox" readonly id="copy-${v}">${esc(lineText(v))}</textarea><p class="hint">自動複製失敗，請長按上面文字全選複製。</p>` : ''}
        </div>` : ''}
      </article>`;
    }).join('');
    $('#board').innerHTML = (S.me.googleKey ? '<div id="map"></div>' : '') + cards;
    if (S.gmapsReady) drawMap();
  }
  async function drawMap() {
    const el = $('#map'); if (!el) return;
    const { Map: GMap, Polyline } = await google.maps.importLibrary('maps');
    const { Marker } = await google.maps.importLibrary('marker');
    if (!S.map || S.map.getDiv() !== el) S.map = new GMap(el, { center: S.me.warehouse, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    S.mapObjs.forEach(o => o.setMap(null)); S.mapObjs = [];
    const col = { car: '#2B5A8C', m1: '#1C8468', m2: '#B25E17', '': '#888' };
    const bounds = new google.maps.LatLngBounds(); bounds.extend(S.me.warehouse);
    S.mapObjs.push(new Marker({ map: S.map, position: S.me.warehouse, title: '倉庫', label: { text: '倉', color: '#fff', fontWeight: '700' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#16211E', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }));
    for (const v of VEH.concat([''])) {
      const list = v ? vStops(v) : S.stops.filter(s => !s.veh);
      list.forEach((s, i) => {
        if (s.lat == null) return; const p = { lat: s.lat, lng: s.lng }; bounds.extend(p);
        S.mapObjs.push(new Marker({ map: S.map, position: p, title: s.shop, label: { text: v ? String(i + 1) : '?', color: '#fff', fontSize: '12px', fontWeight: '700' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: col[v], fillOpacity: s.status === 'pending' ? 1 : 0.4, strokeColor: '#fff', strokeWeight: 2 } }));
      });
      if (v && S.routes[v] && S.routes[v].path.length) S.mapObjs.push(new Polyline({ map: S.map, path: S.routes[v].path, strokeColor: col[v], strokeOpacity: 0.85, strokeWeight: 4 }));
    }
    if (S.stops.length) S.map.fitBounds(bounds, 40);
  }
  function lineText(v) {
    const list = vStops(v), pend = list.filter(s => s.status === 'pending'), pl = PLANS[v], offset = list.length - pend.length;
    let t = `【瑞城配送】${mmdd(S.date)} ${vName(v)}\n共 ${pend.length} 站｜約 ${pl.kmLeft.toFixed(1)} km｜預計 ${fmtT(pl.end)} 回倉\n`;
    pend.forEach((s, i) => {
      const r = pl.rows[s.id], pr = partnerOf(s);
      t += `\n${offset + i + 1}. ${s.kind === 'pickup' ? '【取貨】' : ''}${s.shop}${s.urgent ? ' 【急】' : ''}　${s.eta ? s.eta : '約 ' + fmtT(r.eta)} 到`;
      t += `\n   ${s.addr}${s.phone ? '　' + s.phone : ''}`;
      if (hoursTxt(s)) t += `\n   營業 ${hoursTxt(s)}${r.wait >= 10 ? '（到了要等開門）' : ''}`;
      if (s.items) t += `\n   ${s.items}`;
      if (pr) t += s.kind === 'pickup' ? `\n   → 取完送到 ${pr.shop}` : `\n   ← 貨要先到 ${pr.shop} 拿`;
    });
    t += `\n\n導航：`; mapsSegments(v).forEach(g => t += `\n第${g.from}–${g.to}站 ${g.url}`);
    t += `\n\n每完成一站請開排車台按「已送達／已取貨」：${location.origin}`;
    return t;
  }

  // ---------- 排車（Google） ----------
  async function ensureGeo(stops, msgSel) {
    const need = stops.filter(s => s.lat == null && s.addr);
    if (!need.length) return [];
    if (!S.gmapsReady) return need;
    const patches = [];
    await GM.geocodeMany(need, (i, n, r) => { busy(msgSel, `轉座標 ${i + 1}/${n}…`); if (r && r.lat != null) { need[i].lat = r.lat; need[i].lng = r.lng; patches.push({ id: need[i].id, lat: r.lat, lng: r.lng }); } });
    if (patches.length) await api('/stops', { method: 'PATCH', body: patches });
    return need.filter(s => s.lat == null);
  }
  function departureDate() {
    const [y, m, d] = S.date.split('-').map(Number), st = dayStart();
    let dep = new Date(y, m - 1, d, Math.floor(st / 60), st % 60);
    const nm = nowMin(); if (nm != null && nm > st) dep = new Date();
    return dep;
  }
  async function fetchMatrix(msgSel) {
    const c = ctx();
    if (c.matrix) return c.matrix;
    if (!S.gmapsReady) return null;
    const sorted = S.stops.slice().sort((a, b) => a.id < b.id ? -1 : 1);
    const pts = [S.me.warehouse].concat(sorted.map(s => s.lat != null ? { lat: s.lat, lng: s.lng } : S.me.warehouse));
    if (pts.length > 60) throw new Error('站數超過 60，請分兩天或刪掉已完成的舊站');
    const dep = departureDate();
    busy(msgSel, 'Google 汽車車程表…'); const car = await GM.matrix(pts, 'car', dep);
    busy(msgSel, 'Google 機車車程表…'); const moto = await GM.matrix(pts, 'moto', dep);
    S.matrix = { car, moto }; S.matrixKey = c.key;
    if (moto.fallback) setBanner('', '機車路線模式暫時無法使用，機車改用汽車路線估算。');
    return S.matrix;
  }
  async function fetchRoutes(msgSel) {
    S.routes = {};
    if (!S.gmapsReady) { const clr = S.stops.filter(s => s.status === 'pending' && s.eta).map(s => ({ id: s.id, eta: '' })); if (clr.length) await api('/stops', { method: 'PATCH', body: clr }); return; }
    const dep = departureDate(), patches = [];
    for (const v of VEH) {
      const pend = pendingOf(v).filter(s => s.lat != null);
      if (!pend.length) continue;
      busy(msgSel, `${vName(v)} 完整路線…`);
      const lf = lastFixed(v);
      const start = lf && lf.lat != null ? { lat: lf.lat, lng: lf.lng } : S.me.warehouse;
      const r = await GM.route([start].concat(pend.map(s => ({ lat: s.lat, lng: s.lng })), [S.me.warehouse]), MODE[v], dep).catch(e => { console.warn(e); return null; });
      if (!r) continue;
      S.routes[v] = r;
      // 用 Google 每段時間算 ETA（含等開門與停留）
      const per = ctx().perStop[v]; let t = RC.startState(S.stops, v, dayStart(), nowMin()).t;
      pend.forEach((s, i) => {
        const leg = r.legs[i] || { min: 0, km: 0 }; t += leg.min;
        const o = tmin(s.open); if (o != null && t < o) t = o;
        patches.push({ id: s.id, eta: fmtT(t), leg_min: +leg.min.toFixed(1), leg_km: +leg.km.toFixed(2) });
        s.eta = fmtT(t); t += per;
      });
    }
    if (patches.length) await api('/stops', { method: 'PATCH', body: patches });
  }
  async function runAuto(btn) {
    btn.disabled = true;
    try {
      const noGeo = await ensureGeo(S.stops.filter(s => s.status === 'pending'), '#a-msg');
      const skip = new Set(S.stops.filter(s => s.status === 'pending' && isClosedToday(s)).map(s => s.id));
      const mtx = await fetchMatrix('#a-msg');
      busy('#a-msg', '計算分車與順序…');
      await new Promise(r => setTimeout(r, 30));
      const a = RC.autoAssign(Object.assign(ctx(), { matrix: mtx }), S.stops, S.fleet.active, dayStart(), nowMin(), skip);
      const list = [];
      S.stops.forEach(x => { const t = a[x.id]; if (t && (t.veh !== x.veh || t.seq !== x.seq)) { list.push({ id: x.id, veh: t.veh, seq: t.seq, eta: '' }); x.veh = t.veh; x.seq = t.seq; x.eta = ''; } });
      skip.forEach(id => { const x = byId(id); if (x && x.veh) { list.push({ id, veh: '', seq: 0 }); x.veh = ''; x.seq = 0; } });
      if (list.length) await api('/stops', { method: 'PATCH', body: list });
      await fetchRoutes('#a-msg');
      await refresh();
      const un = S.stops.filter(s => s.status === 'pending' && !s.veh).length;
      const late = VEH.reduce((n, v) => n + Object.values(PLANS[v].rows).filter(r => r.late > 0).length, 0);
      const parts = [];
      if (!mtx) parts.push('沒有 Google 金鑰，用估算排的');
      if (noGeo.length) parts.push(`${noGeo.length} 站地址轉不出座標`);
      if (skip.size) parts.push(`${skip.size} 站今天公休，留在未分配`);
      if (un - skip.size > 0) parts.push(`${un - skip.size} 站沒有車可送`);
      if (late) parts.push(`${late} 站可能趕不上打烊`);
      flash('#a-msg', parts.length ? '排好了，但：' + parts.join('；') : '路線排好了，汽車與機車各用自己的 Google 車程。', parts.length > 0);
    } catch (e) { flash('#a-msg', '排車失敗：' + e.message, true); }
    finally { btn.disabled = false; }
  }
  async function retime() {
    try { await ensureGeo(S.stops.filter(s => s.status === 'pending'), '#a-msg'); await fetchMatrix('#a-msg'); await fetchRoutes('#a-msg'); await refresh(); flash('#a-msg', '時間已用 Google 更新。'); }
    catch (e) { flash('#a-msg', '更新失敗：' + e.message, true); }
  }

  // ---------- 新增訂單 ----------
  function baseStop(o) {
    return Object.assign({ id: newId(), date: S.date, kind: 'deliver', needs: '', customer_code: '', supplier_id: null, shop: '', phone: '', addr: '', lat: null, lng: null, open: '', close: '', items: '', bulky: false, urgent: false, veh: '', seq: 0, status: 'pending', note: '', done_at: '', source: 'manual' }, o);
  }
  // order: {code, shop, phone, addr, lat, lng, open, close, items, bulky, urgent, pickup:{supplier_id?, name, addr, lat, lng, open, close, items}|null, source}
  async function addOrder(o) {
    const list = []; let pId = '';
    if (o.pickup && o.pickup.addr) {
      const p = baseStop({ kind: 'pickup', supplier_id: o.pickup.supplier_id ?? null, shop: o.pickup.name || '供應商', addr: o.pickup.addr, lat: o.pickup.lat ?? null, lng: o.pickup.lng ?? null, open: normT(o.pickup.open), close: normT(o.pickup.close), items: '取：' + (o.pickup.items || o.items || ''), bulky: !!o.bulky, urgent: !!o.urgent, source: o.source || 'manual' });
      pId = p.id; list.push(p);
    }
    list.push(baseStop({ customer_code: normCode(o.code), shop: o.shop, phone: o.phone || '', addr: o.addr, lat: o.lat ?? null, lng: o.lng ?? null, open: normT(o.open), close: normT(o.close), items: o.items || '', bulky: !!o.bulky, urgent: !!o.urgent, needs: pId, source: o.source || 'manual' }));
    let placed = '';
    if (o.urgent && S.stops.some(s => s.veh)) {
      const r = RC.insertUrgent(ctx(), list, S.stops, S.fleet.active, dayStart(), nowMin());
      if (r.veh) {
        list.forEach(x => { x.veh = r.veh; x.seq = r.seqs[x.id] || 0; }); placed = r.veh;
        const others = S.stops.filter(s => s.veh === r.veh && r.seqs[s.id] && r.seqs[s.id] !== s.seq).map(s => ({ id: s.id, seq: r.seqs[s.id] }));
        await api('/stops', { method: 'POST', body: list });
        if (others.length) await api('/stops', { method: 'PATCH', body: others });
        return placed;
      }
    }
    await api('/stops', { method: 'POST', body: list });
    return 'added';
  }
  // 從客戶檔補資料
  async function enrich(orders) {
    const codes = orders.map(o => o.code).filter(Boolean), names = orders.filter(o => !o.code && o.shop).map(o => o.shop);
    if (!codes.length && !names.length) return orders;
    const found = await api('/customers/lookup', { method: 'POST', body: { codes, names } }).catch(() => ({}));
    for (const o of orders) {
      let c = o.code && found['code:' + o.code];
      if (!c && o.shop && found['name:' + o.shop] && found['name:' + o.shop].length === 1) c = found['name:' + o.shop][0];
      if (c) {
        o.matched = c.code + ' ' + c.name;
        if (!o.code) o.code = c.code;
        if (!o.addr || c.addr) { if (!o.addr || o.addr.replace(/\s/g, '') === c.addr.replace(/\s/g, '')) { o.addr = c.addr; o.lat = c.lat; o.lng = c.lng; } }
        if (!o.phone) o.phone = c.phone;
        if (!o.open) o.open = c.open; if (!o.close) o.close = c.close;
        o.closed_days = c.closed_days;
      }
      if (o.pickup && o.pickup.name) {
        const sp = findSupplier(o.pickup.name);
        if (sp) { o.pickup.supplier_id = sp.id; if (!o.pickup.addr) o.pickup.addr = sp.addr; o.pickup.lat = sp.lat; o.pickup.lng = sp.lng; o.pickup.open = sp.open; o.pickup.close = sp.close; o.pickup.name = sp.name; }
      }
    }
    return orders;
  }
  function findSupplier(name) {
    const n = String(name || '').replace(/\s/g, ''); if (n.length < 2) return null;
    return S.suppliers.find(s => { const m = s.name.replace(/\s/g, ''); return n.includes(m) || m.includes(n); }) || null;
  }

  // ---------- 照片 ----------
  function showThumbs() {
    const box = $('#p-thumbs'); box.innerHTML = '';
    S.photo.files.forEach(f => { const img = document.createElement('img'); img.alt = '訂單照片'; img.src = URL.createObjectURL(f); box.appendChild(img); });
    $('#p-label').textContent = S.photo.files.length ? `已選 ${S.photo.files.length} 張，點這裡重選` : '點這裡拍照或選照片';
    $('#p-go').disabled = !S.photo.files.length || S.photo.busy;
  }
  $('#p-files').addEventListener('change', e => { S.photo.files = Array.from(e.target.files || []).slice(0, 8); S.photo.review = null; renderReview(); showThumbs(); });
  $('#p-go').addEventListener('click', async () => {
    if (!S.me.ocr) { flash('#p-msg', '還沒設定 ANTHROPIC_API_KEY。可以把照片傳給 Claude 對話，再用「貼上 JSON」匯入。', true); return; }
    S.photo.busy = true; $('#p-go').disabled = true; busy('#p-msg', '讀取中，大約 20–60 秒…');
    try {
      const fd = new FormData(); S.photo.files.forEach(f => fd.append('images', f)); fd.append('note', $('#p-note').value.trim());
      const { orders } = await api('/ocr', { method: 'POST', body: fd });
      const rows = orders.filter(x => x && (x.shop || x.addr || x.code)).map(x => ({ on: true, code: normCode(x.code), shop: String(x.shop || ''), phone: String(x.phone || ''), addr: String(x.addr || ''), open: normT(x.open), close: normT(x.close), items: String(x.items || ''), bulky: !!x.bulky, urgent: !!x.urgent, unsure: String(x.unsure || ''), source: 'photo',
        pickup: x.pickup && (x.pickup.name || x.pickup.addr) ? { name: String(x.pickup.name || ''), addr: String(x.pickup.addr || ''), items: String(x.pickup.items || ''), open: '', close: '' } : null }));
      S.photo.review = await enrich(rows);
      flash('#p-msg', S.photo.review.length ? `讀到 ${S.photo.review.length} 筆，確認後加入。` : '沒有讀到訂單，換一張清楚一點的試試。');
      renderReview();
    } catch (e) { flash('#p-msg', e.message, true); }
    finally { S.photo.busy = false; $('#p-go').disabled = !S.photo.files.length; }
  });
  function renderReview() {
    const r = S.photo.review, box = $('#p-review');
    if (!r || !r.length) { box.innerHTML = ''; return; }
    const inp = (i, k, ph, sub) => `<input data-rv="${i}" data-k="${k}"${sub ? ' data-sub="1"' : ''} value="${esc(sub ? (r[i].pickup || {})[k] : r[i][k])}" placeholder="${ph}" aria-label="${ph}">`;
    box.innerHTML = `<div class="review">${r.map((x, i) => `<div class="rv">
      <input type="checkbox" data-rvon="${i}" ${x.on ? 'checked' : ''} aria-label="加入這筆">
      <div><div class="shop">${esc(x.shop || '（沒有店名）')}</div>
        <div class="pills">${x.code ? `<span class="pill">${esc(x.code)}</span>` : ''}${x.urgent ? '<span class="pill urg">急件</span>' : ''}${x.bulky ? '<span class="pill">大件</span>' : ''}${x.pickup ? '<span class="pill pick">要先取貨</span>' : ''}${x.closed_days && String(x.closed_days).split(',').includes(String(weekday(S.date))) ? '<span class="pill fail">今天公休</span>' : ''}</div>
        ${x.matched ? `<div class="matched">✓ 客戶檔：${esc(x.matched)}</div>` : (x.code ? `<div class="unsure">⚠ 客戶檔沒有 ${esc(x.code)}</div>` : '')}
        ${x.unsure ? `<div class="unsure">⚠ ${esc(x.unsure)}</div>` : ''}
        <div class="rv-edit">${inp(i, 'shop', '店名')}${inp(i, 'addr', '地址')}
          <div class="rv-row">${inp(i, 'open', '開門 09:00')}${inp(i, 'close', '打烊 20:00')}${inp(i, 'phone', '電話')}</div>${inp(i, 'items', '貨物')}
          <div class="rv-row"><label class="check"><input type="checkbox" data-rvb="${i}" ${x.bulky ? 'checked' : ''}>大件</label><label class="check"><input type="checkbox" data-rvu="${i}" ${x.urgent ? 'checked' : ''}>急件</label>
            <label class="check"><input type="checkbox" data-rvp="${i}" ${x.pickup ? 'checked' : ''}>先取貨</label></div>
          ${x.pickup ? `<div class="lbl">先取貨</div><select data-rvsup="${i}"><option value="">（自填供應商）</option>${S.suppliers.map(s => `<option value="${s.id}"${x.pickup.supplier_id == s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>${inp(i, 'name', '供應商', 1)}${inp(i, 'addr', '供應商地址', 1)}${inp(i, 'items', '要取的貨', 1)}${!x.pickup.addr ? '<div class="unsure">⚠ 供應商地址空白，請補上或選上面的供應商</div>' : ''}` : ''}
        </div></div></div>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="rv-add">加入勾選的 ${r.filter(x => x.on).length} 筆</button><button class="btn sm" id="rv-cancel">取消</button></div>`;
  }
  $('#p-review').addEventListener('input', e => {
    const el = e.target, r = S.photo.review; if (!r) return;
    if (el.dataset.rv != null) { const x = r[+el.dataset.rv]; if (el.dataset.sub) x.pickup[el.dataset.k] = el.value; else { x[el.dataset.k] = el.value; if (el.dataset.k === 'addr') { x.lat = null; x.lng = null; } } }
  });
  $('#p-review').addEventListener('change', e => {
    const el = e.target, r = S.photo.review; if (!r) return;
    if (el.dataset.rvon != null) { r[+el.dataset.rvon].on = el.checked; renderReview(); }
    if (el.dataset.rvb != null) r[+el.dataset.rvb].bulky = el.checked;
    if (el.dataset.rvu != null) r[+el.dataset.rvu].urgent = el.checked;
    if (el.dataset.rvp != null) { const x = r[+el.dataset.rvp]; x.pickup = el.checked ? { name: '', addr: '', items: '', open: '', close: '' } : null; renderReview(); }
    if (el.dataset.rvsup != null) { const x = r[+el.dataset.rvsup], sp = S.suppliers.find(s => s.id == el.value); if (sp) { x.pickup = { supplier_id: sp.id, name: sp.name, addr: sp.addr, lat: sp.lat, lng: sp.lng, open: sp.open, close: sp.close, items: x.pickup.items }; renderReview(); } }
  });
  $('#p-review').addEventListener('click', async e => {
    if (e.target.id === 'rv-cancel') { S.photo.review = null; renderReview(); return; }
    if (e.target.id !== 'rv-add') return;
    const items = (S.photo.review || []).filter(x => x.on && x.shop && x.addr);
    e.target.disabled = true; let n = 0; const urg = [];
    try {
      for (const x of items) { const r = await addOrder(Object.assign({}, x, { pickup: x.pickup && x.pickup.addr ? x.pickup : null })); n++; if (r !== 'added') urg.push(vName(r)); }
      S.photo.review = null; S.photo.files = []; $('#p-files').value = ''; $('#p-note').value = ''; showThumbs(); renderReview();
      await refresh();
      flash('#p-msg', `已加入 ${n} 筆${urg.length ? '，急件已插進 ' + urg.join('、') : ''}。接著按「用 Google 排車」。`);
    } catch (err) { flash('#p-msg', err.message, true); e.target.disabled = false; }
  });

  // ---------- 手動新增 ----------
  let sugTimer;
  $('#f-q').addEventListener('input', () => {
    clearTimeout(sugTimer); const q = $('#f-q').value.trim(); if (q.length < 1) { $('#f-sug').innerHTML = ''; return; }
    sugTimer = setTimeout(async () => {
      const rows = await api('/customers?limit=8&q=' + encodeURIComponent(q)).catch(() => []);
      $('#f-sug').innerHTML = rows.map(c => `<button type="button" class="btn sm" data-pick='${esc(JSON.stringify(c))}' style="margin:4px 4px 0 0">${esc(c.code)} ${esc(c.name)}</button>`).join('');
    }, 250);
  });
  $('#f-sug').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const c = JSON.parse(b.dataset.pick);
    $('#f-q').value = c.code; $('#f-shop').value = c.name; $('#f-addr').value = c.addr; $('#f-open').value = c.open; $('#f-close').value = c.close; $('#f-sug').innerHTML = '';
    $('#f-shop').dataset.cust = JSON.stringify({ code: c.code, phone: c.phone, lat: c.lat, lng: c.lng, addr: c.addr });
  });
  $('#f-pick').addEventListener('change', e => { $('#f-pickbox').hidden = !e.target.checked; });
  function renderSupSelect() { const sel = $('#f-sup'), cur = sel.value; sel.innerHTML = S.suppliers.length ? S.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') : '<option value="">（先到「供應商」新增）</option>'; if (cur) sel.value = cur; }
  $('#f-add').addEventListener('click', async e => {
    const shop = $('#f-shop').value.trim(), addr = $('#f-addr').value.trim();
    if (!shop || !addr) { flash('#f-msg', '請填店名和地址。', true); return; }
    let cust = {}; try { cust = JSON.parse($('#f-shop').dataset.cust || '{}'); } catch { }
    const sameAddr = cust.addr && cust.addr.replace(/\s/g, '') === addr.replace(/\s/g, '');
    let pickup = null;
    if ($('#f-pick').checked) {
      const sp = S.suppliers.find(x => x.id == $('#f-sup').value);
      if (!sp) { flash('#f-msg', '請先選供應商。', true); return; }
      pickup = { supplier_id: sp.id, name: sp.name, addr: sp.addr, lat: sp.lat, lng: sp.lng, open: sp.open, close: sp.close, items: $('#f-pitems').value.trim() };
    }
    e.target.disabled = true;
    try {
      const r = await addOrder({ code: cust.code || $('#f-q').value.trim(), shop, phone: cust.phone || '', addr, lat: sameAddr ? cust.lat : null, lng: sameAddr ? cust.lng : null, items: $('#f-items').value.trim(), bulky: $('#f-bulky').checked, urgent: $('#f-urgent').checked, open: $('#f-open').value, close: $('#f-close').value, pickup, source: 'manual' });
      ['#f-q', '#f-shop', '#f-addr', '#f-items', '#f-open', '#f-close', '#f-pitems'].forEach(q => $(q).value = '');
      ['#f-bulky', '#f-urgent', '#f-pick'].forEach(q => $(q).checked = false); $('#f-pickbox').hidden = true; delete $('#f-shop').dataset.cust;
      await refresh();
      flash('#f-msg', r === 'added' ? '已加入，按「用 Google 排車」分配。' : `急件已插進 ${vName(r)} 的路線。`);
    } catch (err) { flash('#f-msg', err.message, true); }
    finally { e.target.disabled = false; }
  });
  $('#j-go').addEventListener('click', async e => {
    let arr; try { const v = JSON.parse($('#j-text').value); arr = Array.isArray(v) ? v : v.orders; } catch { flash('#p-msg', 'JSON 格式不對。', true); return; }
    if (!Array.isArray(arr)) { flash('#p-msg', 'JSON 要是陣列。', true); return; }
    e.target.disabled = true;
    try {
      const rows = await enrich(arr.map(x => ({ on: true, code: normCode(x.code), shop: String(x.shop || ''), phone: String(x.phone || ''), addr: String(x.addr || ''), open: normT(x.open), close: normT(x.close), items: String(x.items || ''), bulky: !!x.bulky, urgent: !!x.urgent, unsure: String(x.unsure || ''), source: 'claude',
        pickup: x.pickup && (x.pickup.name || x.pickup.addr) ? { name: String(x.pickup.name || ''), addr: String(x.pickup.addr || ''), items: String(x.pickup.items || ''), open: '', close: '' } : null })));
      S.photo.review = rows; renderReview(); $('#j-text').value = '';
      flash('#p-msg', `讀到 ${rows.length} 筆，請在上面「拍照排單」區確認後加入。`);
      $('#p-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { flash('#p-msg', err.message, true); }
    finally { e.target.disabled = false; }
  });

  // ---------- 排車面板事件 ----------
  $('#auto').addEventListener('click', e => runAuto(e.target));
  $('#banner').addEventListener('click', e => { if (e.target.id === 'retime') retime(); });
  $('#s-start').addEventListener('change', async e => { const t = normT(e.target.value); if (!t) return; S.fleet.start = t; await api('/settings/fleet', { method: 'PUT', body: S.fleet }); S.matrix = null; render(); });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
    const act = b.dataset.act, id = b.dataset.id, s = id && byId(id);
    if (act !== 'del' && act !== 'delsup' && S.confirmDel) S.confirmDel = null;
    try {
      if (act === 'up' || act === 'down') {
        const pend = pendingOf(s.veh), i = pend.indexOf(s), j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= pend.length) return;
        await api('/stops', { method: 'PATCH', body: [{ id: s.id, seq: pend[j].seq, eta: '' }, { id: pend[j].id, seq: s.seq, eta: '' }] }); S.routes = {}; await refresh();
      } else if (act === 'del') {
        if (S.confirmDel !== id) { S.confirmDel = id; render(); setTimeout(() => { if (S.confirmDel === id) { S.confirmDel = null; render(); } }, 4000); return; }
        S.confirmDel = null; const pr = partnerOf(s);
        await api('/stops', { method: 'DELETE', body: { ids: pr && pr.status === 'pending' ? [id, pr.id] : [id] } }); await refresh();
      } else if (act === 'active') {
        const v = b.dataset.v; S.fleet.active[v] = S.fleet.active[v] === false; await api('/settings/fleet', { method: 'PUT', body: S.fleet }); render();
      } else if (act === 'copy') {
        const v = b.dataset.v, txt = lineText(v);
        try { await navigator.clipboard.writeText(txt); S.copyFor = null; b.textContent = '已複製，貼到 LINE'; setTimeout(() => render(), 2000); }
        catch { S.copyFor = v; render(); const ta = $('#copy-' + v); if (ta) { ta.focus(); ta.select(); } }
      } else if (act === 'done') { S.failFor = null; await api('/stops', { method: 'PATCH', body: [{ id, status: 'done', done_at: new Date().toISOString(), note: '' }] }); await refresh(); }
      else if (act === 'failopen') { S.failFor = S.failFor === id ? null : id; render(); }
      else if (act === 'fail') { S.failFor = null; await api('/stops', { method: 'PATCH', body: [{ id, status: 'fail', note: b.dataset.r, done_at: new Date().toISOString() }] }); await refresh(); }
      else if (act === 'undo') { await api('/stops', { method: 'PATCH', body: [{ id, status: 'pending', done_at: '', note: '' }] }); await refresh(); }
      else if (act === 'drv') { S.drv = b.dataset.v; S.failFor = null; render(); }
      else if (act === 'delsup') {
        const k = 'sup:' + id; if (S.confirmDel !== k) { S.confirmDel = k; renderSuppliers(); setTimeout(() => { if (S.confirmDel === k) { S.confirmDel = null; renderSuppliers(); } }, 4000); return; }
        S.confirmDel = null; await api('/suppliers', { method: 'DELETE', body: { id: +id } }); await refresh();
      } else if (act === 'geo1') { await geocodeRows([b.dataset.kind === 'sup' ? S.suppliers.find(x => x.id == id) : S.cRows.find(x => x.code === id)], b.dataset.kind); }
    } catch (err) { flash(S.view === 'driver' ? '#d-msg' : '#a-msg', err.message, true); }
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.act === 'setveh') {
      const s = byId(el.dataset.id), pr = s && partnerOf(s), v = el.value;
      const seq = v ? Math.max(0, ...vStops(v).map(x => x.seq || 0)) + 1 : 0; const list = [];
      if (pr && pr.status === 'pending' && pr.veh !== v) { const first = s.kind === 'pickup' ? s : pr, second = s.kind === 'pickup' ? pr : s; list.push({ id: first.id, veh: v, seq, eta: '' }, { id: second.id, veh: v, seq: v ? seq + 1 : 0, eta: '' }); }
      else list.push({ id: s.id, veh: v, seq, eta: '' });
      await api('/stops', { method: 'PATCH', body: list }); S.routes = {}; await refresh();
    }
  });

  // ---------- 客戶 ----------
  const DAYS_HTML = (val, key) => { const set = new Set(String(val || '').split(',').filter(Boolean)); return `<span class="days">${[0, 1, 2, 3, 4, 5, 6].map(d => `<label><input type="checkbox" data-day="${d}" data-key="${esc(key)}" ${set.has(String(d)) ? 'checked' : ''}><span>${WEEK[d]}</span></label>`).join('')}</span>`; };
  async function loadCustomers() {
    const q = $('#c-q').value.trim(), mode = $('#c-mode').value;
    const k = S.customers || {}; $('#c-kpi').innerHTML = `<span><b>${k.n || 0}</b> 家客戶</span><span><b>${(k.n || 0) - (k.hours || 0)}</b> 家沒營業時間</span><span><b>${k.nogeo || 0}</b> 家沒座標</span>`;
    S.cRows = await api('/customers?limit=500&mode=' + mode + '&q=' + encodeURIComponent(q));
    renderCustomerTable();
  }
  function renderCustomerTable() {
    const rows = S.cRows;
    $('#c-table').innerHTML = `<thead><tr><th>編號</th><th>店名</th><th>電話</th><th>地址</th><th>座標</th><th>開門</th><th>打烊</th><th>公休</th><th>備註</th></tr></thead><tbody>${rows.map(c => `<tr>
      <td class="num">${esc(c.code)}</td><td>${esc(c.name)}</td><td><input data-c="${esc(c.code)}" data-k="phone" value="${esc(c.phone)}" style="width:110px"></td>
      <td><input class="w" data-c="${esc(c.code)}" data-k="addr" value="${esc(c.addr)}"></td>
      <td>${c.lat != null ? '<span class="geo-ok">✓</span>' : (c.addr ? `<button class="btn sm" data-act="geo1" data-kind="cust" data-id="${esc(c.code)}">補</button>` : '<span class="geo-no">無地址</span>')}</td>
      <td><input class="t" type="time" data-c="${esc(c.code)}" data-k="open" value="${esc(c.open)}"></td><td><input class="t" type="time" data-c="${esc(c.code)}" data-k="close" value="${esc(c.close)}"></td>
      <td>${DAYS_HTML(c.closed_days, c.code)}</td><td><input data-c="${esc(c.code)}" data-k="note" value="${esc(c.note)}" style="width:120px"></td></tr>`).join('')}</tbody>`;
    if (!rows.length) $('#c-table').innerHTML = '<tbody><tr><td class="empty">沒有符合的客戶。</td></tr></tbody>';
  }
  $('#c-q').addEventListener('input', () => { clearTimeout(sugTimer); sugTimer = setTimeout(loadCustomers, 300); });
  $('#c-mode').addEventListener('change', loadCustomers);
  $('#c-table').addEventListener('input', e => { const el = e.target; if (el.dataset.c) { (S.cDirty[el.dataset.c] = S.cDirty[el.dataset.c] || { code: el.dataset.c })[el.dataset.k] = el.value; if (el.dataset.k === 'addr') { S.cDirty[el.dataset.c].lat = null; S.cDirty[el.dataset.c].lng = null; } el.classList.add('dirty'); $('#c-save').disabled = false; } });
  $('#c-table').addEventListener('change', e => { const el = e.target; if (el.dataset.day != null) { const key = el.dataset.key, row = el.closest('tr'); const days = Array.from(row.querySelectorAll('[data-day]:checked')).map(x => x.dataset.day).join(','); (S.cDirty[key] = S.cDirty[key] || { code: key }).closed_days = days; $('#c-save').disabled = false; } });
  $('#c-save').addEventListener('click', async () => {
    const list = Object.values(S.cDirty); if (!list.length) return;
    try { await api('/customers', { method: 'PATCH', body: list }); S.cDirty = {}; $('#c-save').disabled = true; flash('#c-msg', `已儲存 ${list.length} 筆。`); await refresh(); await loadCustomers(); }
    catch (e) { flash('#c-msg', e.message, true); }
  });
  $('#c-geo').addEventListener('click', async () => {
    if (!S.gmapsReady) { flash('#c-msg', 'Google 地圖還沒載入（要先設定金鑰）。', true); return; }
    const rows = await api('/customers?limit=2000&mode=nogeo');
    if (!rows.length) { flash('#c-msg', '所有有地址的客戶都有座標了。'); return; }
    await geocodeRows(rows, 'cust');
  });
  async function geocodeRows(rows, kind) {
    const msg = kind === 'sup' ? '#s-msg' : '#c-msg';
    const btn = $(kind === 'sup' ? '#s-geo' : '#c-geo'); btn.disabled = true; let ok = 0, part = 0, none = 0; const patches = [];
    try {
      await GM.geocodeMany(rows, (i, n, r) => {
        busy(msg, `轉座標 ${i + 1}/${n}：${rows[i].name}`);
        if (r && r.lat != null) { ok++; if (r.partial) part++; patches.push(kind === 'sup' ? { id: rows[i].id, lat: r.lat, lng: r.lng } : { code: rows[i].code, lat: r.lat, lng: r.lng, note: r.partial && !rows[i].note ? '地址可能不精確：' + r.formatted : rows[i].note }); }
        else none++;
        if (patches.length >= 50) { const b = patches.splice(0); api(kind === 'sup' ? '/suppliers' : '/customers', { method: 'PATCH', body: b }); }
      });
      if (patches.length) await api(kind === 'sup' ? '/suppliers' : '/customers', { method: 'PATCH', body: patches });
      flash(msg, `完成：${ok} 筆有座標${part ? `（${part} 筆只對到大概位置，已在備註標記）` : ''}${none ? `，${none} 筆找不到` : ''}。`);
      await refresh(); if (kind !== 'sup') await loadCustomers(); else renderSuppliers();
    } catch (e) { flash(msg, '轉座標失敗：' + e.message, true); }
    finally { btn.disabled = false; }
  }
  // 匯入（客戶／供應商共用）
  const FIELDS = {
    cust: [['code', '客戶編號', ['客戶編號', '編號', '客戶代號', '代號', 'code', 'CODE'], true], ['name', '客戶名稱', ['客戶名稱', '名稱', '簡稱', '店名', 'name'], true], ['phone', '電話', ['電話', 'TEL', 'tel', '聯絡']], ['addr', '地址', ['地址', '送貨地址', 'ADDR', 'addr']], ['open', '開門', ['開門', '開店', '營業開始', '開始']], ['close', '打烊', ['打烊', '關店', '營業結束', '結束']], ['closed_days', '公休', ['公休', '休息']], ['note', '備註', ['備註', '說明']]],
    sup: [['name', '供應商名稱', ['供應商', '廠商', '名稱', '簡稱', 'name'], true], ['addr', '地址', ['地址', '取貨地址', 'ADDR', 'addr'], true], ['phone', '電話', ['電話', 'TEL', 'tel', '聯絡']], ['open', '開門', ['開門', '開店', '營業開始', '開始']], ['close', '打烊', ['打烊', '關店', '營業結束', '結束']], ['closed_days', '公休', ['公休', '休息']], ['note', '備註', ['備註', '說明']]]
  };
  async function readSheet(f) {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', codepage: 950 });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const hi = rows.findIndex(r => r.filter(x => String(x).trim()).length >= 2);
    if (hi < 0) return null;
    return { headers: rows[hi].map(x => String(x).trim()), data: rows.slice(hi + 1).filter(r => r.some(x => String(x).trim())) };
  }
  function mappingUI(kind, box, sheet, onImport) {
    const fields = FIELDS[kind];
    const guess = words => { const i = sheet.headers.findIndex(h => words.some(w => h.includes(w))); return i >= 0 ? i : ''; };
    box.innerHTML = `<p class="hint">讀到 ${sheet.data.length} 筆。請確認欄位對應：</p><div class="mapping">${fields.map(([k, label, words, req]) => `<label class="field"><span class="lbl">${label}${req ? '（必填）' : ''}</span><select data-map="${k}"><option value="">（不匯入）</option>${sheet.headers.map((h, i) => `<option value="${i}" ${guess(words) === i ? 'selected' : ''}>${esc(h || '欄 ' + (i + 1))}</option>`).join('')}</select></label>`).join('')}</div>
      <button class="btn primary" style="margin-top:8px">匯入 ${sheet.data.length} 筆</button>`;
    box.querySelector('button').addEventListener('click', () => {
      const map = {}; box.querySelectorAll('[data-map]').forEach(s => { if (s.value !== '') map[s.dataset.map] = +s.value; });
      const missing = fields.filter(f => f[3] && map[f[0]] == null).map(f => f[1]);
      if (missing.length) { onImport(null, '至少要對應：' + missing.join('、')); return; }
      const payload = sheet.data.map(r => { const o = {}; for (const k in map) o[k] = r[map[k]]; return o; }).filter(o => fields.every(f => !f[3] || String(o[f[0]]).trim()));
      onImport(payload);
    });
  }
  $('#c-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const sheet = await readSheet(f); if (!sheet) { flash('#c-msg', '檔案裡沒有資料。', true); return; }
    mappingUI('cust', $('#c-map'), sheet, async (payload, err) => {
      if (err) { flash('#c-msg', err, true); return; }
      busy('#c-msg', '匯入中…');
      try { let n = 0; for (let i = 0; i < payload.length; i += 400) { const r = await api('/customers/import', { method: 'POST', body: payload.slice(i, i + 400) }); n += r.n; } flash('#c-msg', `匯入 ${n} 筆完成。接著按「補座標」。`); $('#c-map').innerHTML = ''; $('#c-file').value = ''; await refresh(); await loadCustomers(); }
      catch (e2) { flash('#c-msg', e2.message, true); }
    });
  });
  $('#s-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const sheet = await readSheet(f); if (!sheet) { flash('#s-imsg', '檔案裡沒有資料。', true); return; }
    mappingUI('sup', $('#s-map'), sheet, async (payload, err) => {
      if (err) { flash('#s-imsg', err, true); return; }
      busy('#s-imsg', '匯入中…');
      try { let n = 0, upd = 0; for (let i = 0; i < payload.length; i += 200) { const r = await api('/suppliers/import', { method: 'POST', body: payload.slice(i, i + 200) }); n += r.n; upd += r.upd; } flash('#s-imsg', `新增 ${n} 家、更新 ${upd} 家。接著按「補座標」。`); $('#s-map').innerHTML = ''; $('#s-file').value = ''; await refresh(); renderSuppliers(); }
      catch (e2) { flash('#s-imsg', e2.message, true); }
    });
  });
  $('#s-geo').addEventListener('click', async () => {
    if (!S.gmapsReady) { flash('#s-msg', 'Google 地圖還沒載入。', true); return; }
    const rows = S.suppliers.filter(s => s.lat == null && s.addr);
    if (!rows.length) { flash('#s-msg', '所有供應商都有座標了。'); return; }
    await geocodeRows(rows, 'sup');
  });

  // ---------- 供應商 ----------
  function renderSuppliers() {
    $('#s-kpi').innerHTML = `<span><b>${S.suppliers.length}</b> 家供應商</span>`;
    $('#s-table').innerHTML = `<thead><tr><th>名稱</th><th>電話</th><th>地址</th><th>座標</th><th>開門</th><th>打烊</th><th>公休</th><th></th></tr></thead><tbody>${S.suppliers.map(s => `<tr>
      <td><input data-s="${s.id}" data-k="name" value="${esc(s.name)}" style="width:130px"></td><td><input data-s="${s.id}" data-k="phone" value="${esc(s.phone)}" style="width:110px"></td>
      <td><input class="w" data-s="${s.id}" data-k="addr" value="${esc(s.addr)}"></td>
      <td>${s.lat != null ? '<span class="geo-ok">✓</span>' : `<button class="btn sm" data-act="geo1" data-kind="sup" data-id="${s.id}">補</button>`}</td>
      <td><input class="t" type="time" data-s="${s.id}" data-k="open" value="${esc(s.open)}"></td><td><input class="t" type="time" data-s="${s.id}" data-k="close" value="${esc(s.close)}"></td>
      <td>${DAYS_HTML(s.closed_days, 'sup:' + s.id)}</td>
      <td>${S.confirmDel === 'sup:' + s.id ? `<button class="btn sm urgent" data-act="delsup" data-id="${s.id}">確定</button>` : `<button class="icon danger" data-act="delsup" data-id="${s.id}" aria-label="刪除">✕</button>`}</td></tr>`).join('')}</tbody>`;
    if (!S.suppliers.length) $('#s-table').innerHTML = '<tbody><tr><td class="empty">還沒有供應商。</td></tr></tbody>';
  }
  $('#s-table').addEventListener('input', e => { const el = e.target; if (el.dataset.s) { (S.sDirty[el.dataset.s] = S.sDirty[el.dataset.s] || { id: +el.dataset.s })[el.dataset.k] = el.value; if (el.dataset.k === 'addr') { S.sDirty[el.dataset.s].lat = null; S.sDirty[el.dataset.s].lng = null; } el.classList.add('dirty'); $('#s-save').disabled = false; } });
  $('#s-table').addEventListener('change', e => { const el = e.target; if (el.dataset.day != null && el.dataset.key.startsWith('sup:')) { const id = el.dataset.key.slice(4), row = el.closest('tr'); (S.sDirty[id] = S.sDirty[id] || { id: +id }).closed_days = Array.from(row.querySelectorAll('[data-day]:checked')).map(x => x.dataset.day).join(','); $('#s-save').disabled = false; } });
  $('#s-save').addEventListener('click', async () => { const list = Object.values(S.sDirty); if (!list.length) return; try { await api('/suppliers', { method: 'PATCH', body: list }); S.sDirty = {}; $('#s-save').disabled = true; flash('#s-msg', '已儲存。'); await refresh(); } catch (e) { flash('#s-msg', e.message, true); } });
  $('#s-add').addEventListener('click', async () => {
    const name = $('#s-name').value.trim(), addr = $('#s-addr').value.trim(); if (!name || !addr) { flash('#s-msg', '供應商要有名稱和地址。', true); return; }
    let geo = null; if (S.gmapsReady) { busy('#s-msg', '轉座標…'); geo = await GM.geocode(addr).catch(() => null); }
    try {
      await api('/suppliers', { method: 'POST', body: { name, addr, phone: $('#s-phone').value.trim(), open: $('#s-open').value, close: $('#s-close').value, lat: geo && geo.lat, lng: geo && geo.lng } });
      ['#s-name', '#s-addr', '#s-phone', '#s-open', '#s-close'].forEach(q => $(q).value = ''); flash('#s-msg', geo ? '已新增，座標 OK。' : '已新增（沒有座標，稍後按「補」）。'); await refresh();
    } catch (e) { flash('#s-msg', e.message, true); }
  });

  // ---------- 設定 ----------
  function renderSettings() {
    const f = S.fleet; VEH.forEach(v => { $('#n-' + v).value = f.names[v] || ''; });
    document.querySelector('#view-settings .panel').hidden = !S.me.canDispatch;
    const per = f.perStop || {}; $('#ps-car').value = per.car ?? 8; $('#ps-moto').value = per.m1 ?? per.moto ?? 5; $('#ps-radius').value = f.motoRadiusKm ?? 10;
    $('#set-status').innerHTML = `<div>Google 地圖金鑰：${S.me.googleKey ? '<span class="geo-ok">已設定</span>' + (S.gmapsReady ? '，已載入' : '，載入中或失敗') : '<span class="geo-no">未設定</span>'}</div>
      <div>照片辨識（Anthropic）：${S.me.ocr ? '<span class="geo-ok">已設定</span>' : '<span class="geo-no">未設定</span>'}</div>
      <div>倉庫：${esc(S.me.warehouse.addr)}</div><div>這個網址：${esc(location.origin)}（給司機登入用）</div>`;
  }
  $('#set-save').addEventListener('click', async () => {
    const f = S.fleet; VEH.forEach(v => { f.names[v] = $('#n-' + v).value.trim() || KIND[v]; });
    const moto = +$('#ps-moto').value || 5; f.perStop = { car: +$('#ps-car').value || 8, m1: moto, m2: moto }; f.motoRadiusKm = +$('#ps-radius').value || 10;
    try { await api('/settings/fleet', { method: 'PUT', body: f }); flash('#set-msg', '已儲存。'); } catch (e) { flash('#set-msg', e.message, true); }
  });

  $('#my-pin-save').addEventListener('click', async () => {
    const pin = $('#my-pin').value.trim();
    try { await api('/me/pin', { method: 'POST', body: { pin } }); $('#my-pin').value = ''; flash('#my-pin-msg', 'PIN 已更改，下次登入用新的。'); } catch (e) { flash('#my-pin-msg', e.message, true); }
  });

  // ---------- 使用者（老闆） ----------
  const ROLE_OPTS = [['owner', '老闆'], ['dispatch', '排車員'], ['driver', '司機']];
  async function loadUsers() {
    const users = await api('/users').catch(e => { flash('#u-msg', e.message, true); return []; });
    $('#u-table').innerHTML = `<thead><tr><th>名字</th><th>角色</th><th>預設車輛</th><th>狀態</th><th>最後登入</th><th>重設 PIN</th><th></th></tr></thead><tbody>${users.map(u => `<tr data-uid="${u.id}">
      <td><input data-uk="name" value="${esc(u.name)}" style="width:110px">${u.id === S.me.uid ? ' <span class="pill ok">我</span>' : ''}</td>
      <td><select data-uk="role">${ROLE_OPTS.map(([v, n]) => `<option value="${v}"${u.role === v ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
      <td><select data-uk="veh"><option value="">不指定</option>${VEH.map(v => `<option value="${v}"${u.veh === v ? ' selected' : ''}>${esc(vName(v))}</option>`).join('')}</select></td>
      <td><button class="toggle" data-uk="active" aria-pressed="${u.active}">${u.active ? '啟用中' : '已停用'}</button></td>
      <td class="sub">${u.last_login ? esc(new Date(u.last_login.replace(' ', 'T') + 'Z').toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '—'}</td>
      <td><div class="row" style="gap:4px;flex-wrap:nowrap"><input data-uk="pin" inputmode="numeric" placeholder="新 PIN" style="width:90px"><button class="btn sm" data-uk="pinsave">重設</button></div></td>
      <td>${u.id === S.me.uid ? '' : (S.confirmDel === 'user:' + u.id ? `<button class="btn sm urgent" data-uk="del">確定刪除</button>` : `<button class="icon danger" data-uk="del" aria-label="刪除">✕</button>`)}</td></tr>`).join('')}</tbody>`;
  }
  async function patchUser(id, body, okMsg) {
    try { await api('/users', { method: 'PATCH', body: Object.assign({ id }, body) }); if (okMsg) flash('#u-msg', okMsg); await loadUsers(); if (id === S.me.uid) { S.me = await api('/me'); } }
    catch (e) { flash('#u-msg', e.message, true); await loadUsers(); }
  }
  $('#u-table').addEventListener('change', e => {
    const el = e.target, tr = el.closest('tr'); if (!tr || !el.dataset.uk) return; const id = +tr.dataset.uid;
    if (el.dataset.uk === 'name') patchUser(id, { name: el.value }, '名字已更新。');
    if (el.dataset.uk === 'role') patchUser(id, { role: el.value }, '角色已更新。');
    if (el.dataset.uk === 'veh') patchUser(id, { veh: el.value }, '車輛已更新。');
  });
  $('#u-table').addEventListener('click', async e => {
    const el = e.target.closest('[data-uk]'), tr = e.target.closest('tr'); if (!el || !tr) return; const id = +tr.dataset.uid;
    if (el.dataset.uk === 'active') patchUser(id, { active: el.getAttribute('aria-pressed') !== 'true' }, '狀態已更新。');
    if (el.dataset.uk === 'pinsave') { const pin = tr.querySelector('[data-uk=pin]').value.trim(); if (!pin) { flash('#u-msg', '請先填新 PIN。', true); return; } patchUser(id, { pin }, 'PIN 已重設，記得告訴本人。'); }
    if (el.dataset.uk === 'del') {
      const k = 'user:' + id;
      if (S.confirmDel !== k) { S.confirmDel = k; await loadUsers(); setTimeout(() => { if (S.confirmDel === k) { S.confirmDel = null; loadUsers(); } }, 4000); return; }
      S.confirmDel = null; try { await api('/users', { method: 'DELETE', body: { id } }); flash('#u-msg', '已刪除。'); } catch (err) { flash('#u-msg', err.message, true); } await loadUsers();
    }
  });
  $('#u-add').addEventListener('click', async () => {
    try {
      await api('/users', { method: 'POST', body: { name: $('#u-name').value.trim(), pin: $('#u-pin').value.trim(), role: $('#u-role').value, veh: $('#u-veh').value } });
      ['#u-name', '#u-pin'].forEach(q => $(q).value = ''); flash('#u-msg', '已新增，把 PIN 告訴本人即可登入。'); await loadUsers();
    } catch (e) { flash('#u-msg', e.message, true); }
  });

  // ---------- 司機 ----------
  function renderDriver() {
    const v = S.drv, list = vStops(v), pend = list.filter(s => s.status === 'pending'), pl = PLANS[v];
    const done = list.length - pend.length;
    const etaOf = s => s.eta || (pl.rows[s.id] ? '約 ' + fmtT(pl.rows[s.id].eta) : '');
    const chips = `<div class="chips" role="group" aria-label="選擇車輛">${VEH.map(x => `<button class="chip" style="--vc:var(--${x})" data-act="drv" data-v="${x}" aria-pressed="${x === v}">${esc(vName(x))}</button>`).join('')}</div>`;
    const prog = `<div style="--vc:var(--${v});display:grid;gap:6px"><div class="row"><span class="num" style="font-size:20px;font-weight:600">${done}/${list.length}</span><span class="sub">站完成</span>${pend.length ? `<span class="endt">預計 ${fmtT(pl.end)} 回倉</span>` : ''}</div><div class="bar"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div></div>`;
    let main;
    if (!list.length) main = `<div class="empty">${mmdd(S.date)} 還沒有排到 ${esc(vName(v))} 的路線。</div>`;
    else if (!pend.length) main = `<div class="alldone">全部完成，辛苦了！回倉庫路上注意安全。</div>`;
    else {
      const n = pend[0], idx = list.indexOf(n) + 1, r = pl.rows[n.id], pr = partnerOf(n), pick = n.kind === 'pickup';
      const nav = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(n.addr);
      main = `<article class="next" style="--vc:var(--${v})">
        <div class="eyebrow">下一站・第 ${idx} 站${pick ? '・供應商取貨' : ''}${n.urgent ? '・急件' : ''}・${esc(etaOf(n))} 到</div>
        <h2>${esc(n.shop)}</h2>
        <div class="addr">${esc(n.addr)}</div>
        ${n.phone ? `<div class="tel">☎ <a href="tel:${esc(n.phone.replace(/[^\d+]/g, ''))}">${esc(n.phone)}</a></div>` : ''}
        ${hoursTxt(n) ? `<div class="sub">營業 ${esc(hoursTxt(n))}${r && r.wait >= 10 ? `・會早到 ${fmtDur(r.wait)}` : ''}${r && r.late > 0 ? '・可能已打烊，先打電話' : ''}</div>` : ''}
        <div class="sub">${esc(n.items)}</div>
        ${pr ? `<div class="sub"><b>${pick ? '取完送到：' : '這批貨是從 '}${esc(pr.shop)}${pick ? '' : ' 取的'}</b></div>` : ''}
        <div class="acts">
          <a class="navbtn" href="${esc(nav)}" target="_blank" rel="noopener">開 Google 地圖導航</a>
          <button class="btn done" data-act="done" data-id="${esc(n.id)}">${pick ? '已取貨' : '已送達'}</button>
          <button class="btn fail" data-act="failopen" data-id="${esc(n.id)}">${pick ? '沒拿到' : '無法送達'}</button>
        </div>
        ${S.failFor === n.id ? `<div class="lbl">原因</div><div class="reasons">${(pick ? ['缺貨', '供應商休息', '貨還沒好', '其他'] : ['店休', '老闆不在', '地址錯誤', '拒收', '其他']).map(x => `<button class="btn sm" data-act="fail" data-id="${esc(n.id)}" data-r="${x}">${x}</button>`).join('')}</div>` : ''}
        <p class="msg" id="d-msg"></p>
      </article>`;
    }
    const lst = list.length > 1 || (list.length && !pend.length) ? `<div class="lbl">全部站點</div><ol class="stops dlist" style="--vc:var(--${v})">${list.map((s, i) => s === pend[0] ? '' : `
      <li class="stop${s.status !== 'pending' ? ' done' : ''}${s.kind === 'pickup' ? ' pickup' : ''}"><span class="seq">${i + 1}</span>
        <div><div class="shop">${esc(s.shop)}</div>${linkLine(s)}<div class="sub">${esc(s.addr)}</div><div class="pills">${stopPills(s, pl.rows[s.id])}</div></div>
        <div class="ctl">${s.status !== 'pending' ? `<button class="btn sm" data-act="undo" data-id="${esc(s.id)}">改回</button>` : ''}</div></li>`).join('')}</ol>` : '';
    $('#driver').innerHTML = chips + prog + main + lst;
  }

  boot();
})();
