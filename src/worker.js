// 瑞城排車台 — Cloudflare Worker 後端
// 職責：PIN 登入、D1 資料存取、照片辨識（代呼叫 Anthropic，金鑰不落地到瀏覽器）

const VEH = ['car', 'm1', 'm2'];
const COOKIE = 'rc_session';
const DAY = 86400;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        console.error(e);
        return json({ error: '伺服器錯誤：' + (e.message || e) }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  }
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => { throw new HttpError(400, m); };
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

// ---------- session ----------
const enc = new TextEncoder();
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '');
}
async function makeToken(env, role, name, uid) {
  const body = btoa(unescape(encodeURIComponent(JSON.stringify({ role, name, uid, exp: Math.floor(Date.now() / 1000) + 30 * DAY }))));
  return body + '.' + await hmac(env.SESSION_SECRET, body);
}
async function readSession(req, env) {
  const m = /(?:^|;\s*)rc_session=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || sig !== await hmac(env.SESSION_SECRET, body)) return null;
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(body))));
    return s.exp > Date.now() / 1000 ? s : null;
  } catch { return null; }
}
function cookieHeader(token, maxAge) {
  return { 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}` };
}

// ---------- 使用者 ----------
// 角色：owner（老闆，最高權限）> dispatch（排車員）> driver（司機）
const ROLES = ['owner', 'dispatch', 'driver'];
const ROLE_NAME = { owner: '老闆', dispatch: '排車員', driver: '司機' };
let migrated = false;
async function migrate(env) {
  if (migrated) return;
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, pin_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'driver', veh TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), last_login TEXT DEFAULT '')`);
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM users').first();
  if (!n.n) {
    // 第一次啟用：把原本的兩組 PIN 變成兩個帳號
    await env.DB.prepare('INSERT INTO users (name, pin_hash, role) VALUES (?,?,?)').bind('老闆', await pinHash(env, env.DISPATCH_PIN), 'owner').run();
    await env.DB.prepare('INSERT INTO users (name, pin_hash, role) VALUES (?,?,?)').bind('司機', await pinHash(env, env.DRIVER_PIN), 'driver').run();
  }
  migrated = true;
}
const pinHash = (env, pin) => hmac(env.SESSION_SECRET, 'pin:' + String(pin).trim());
function validPin(p) { return /^\d{4,8}$/.test(String(p || '').trim()); }
const userRow = u => ({ id: u.id, name: u.name, role: u.role, roleName: ROLE_NAME[u.role] || u.role, veh: u.veh || '', active: !!u.active, last_login: u.last_login || '', created_at: u.created_at });

// ---------- router ----------
async function api(req, env, url) {
  if (!env.SESSION_SECRET || !env.DISPATCH_PIN || !env.DRIVER_PIN) throw new HttpError(500, '尚未設定 SESSION_SECRET / DISPATCH_PIN / DRIVER_PIN（見 README）');
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const db = env.DB;
  await migrate(env);

  if (path === '/login' && method === 'POST') {
    const { pin } = await req.json();
    if (!validPin(pin)) throw new HttpError(401, 'PIN 不正確');
    const u = await db.prepare('SELECT * FROM users WHERE pin_hash=?').bind(await pinHash(env, pin)).first();
    if (!u) throw new HttpError(401, 'PIN 不正確');
    if (!u.active) throw new HttpError(403, '這個帳號已停用，請找老闆');
    await db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(u.id).run();
    const token = await makeToken(env, u.role, u.name, u.id);
    return json({ role: u.role, name: u.name }, 200, cookieHeader(token, 30 * DAY));
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, cookieHeader('x', 0));

  const s = await readSession(req, env);
  if (!s) throw new HttpError(401, '請先登入');
  // 每次都確認帳號還在、還沒被停用或改角色
  const me = s.uid ? await db.prepare('SELECT * FROM users WHERE id=?').bind(s.uid).first() : null;
  if (!me || !me.active) throw new HttpError(401, '請重新登入');
  s.role = me.role; s.name = me.name;
  const isOwner = s.role === 'owner';
  const isDispatch = isOwner || s.role === 'dispatch';
  const needDispatch = () => { if (!isDispatch) throw new HttpError(403, '只有排車員或老闆可以做這個動作'); };
  const needOwner = () => { if (!isOwner) throw new HttpError(403, '只有老闆可以做這個動作'); };

  // ----- 使用者管理（老闆） -----
  if (path === '/users' && method === 'GET') {
    needOwner();
    const r = await db.prepare('SELECT * FROM users ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'dispatch\' THEN 1 ELSE 2 END, id').all();
    return json(r.results.map(userRow));
  }
  if (path === '/users' && method === 'POST') {
    needOwner();
    const p = await req.json();
    const name = str(p.name); if (!name) bad('請填名字');
    if (!validPin(p.pin)) bad('PIN 要 4 到 8 位數字');
    if (!ROLES.includes(p.role)) bad('角色不正確');
    const h = await pinHash(env, p.pin);
    if (await db.prepare('SELECT id FROM users WHERE pin_hash=?').bind(h).first()) bad('這組 PIN 已經有人用了，請換一組');
    const r = await db.prepare('INSERT INTO users (name, pin_hash, role, veh) VALUES (?,?,?,?)').bind(name, h, p.role, VEH.includes(p.veh) ? p.veh : '').run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (path === '/users' && method === 'PATCH') {
    needOwner();
    const p = await req.json();
    const u = await db.prepare('SELECT * FROM users WHERE id=?').bind(+p.id).first();
    if (!u) bad('找不到使用者');
    const sets = [], vals = [];
    if (p.name !== undefined) { const nm = str(p.name); if (!nm) bad('名字不能空白'); sets.push('name=?'); vals.push(nm); }
    if (p.role !== undefined) {
      if (!ROLES.includes(p.role)) bad('角色不正確');
      if (u.id === me.id && p.role !== 'owner') bad('不能把自己降級');
      sets.push('role=?'); vals.push(p.role);
    }
    if (p.veh !== undefined) { sets.push('veh=?'); vals.push(VEH.includes(p.veh) ? p.veh : ''); }
    if (p.active !== undefined) {
      if (u.id === me.id && !p.active) bad('不能停用自己');
      sets.push('active=?'); vals.push(p.active ? 1 : 0);
    }
    if (p.pin !== undefined && p.pin !== '') {
      if (!validPin(p.pin)) bad('PIN 要 4 到 8 位數字');
      const h = await pinHash(env, p.pin);
      const dup = await db.prepare('SELECT id FROM users WHERE pin_hash=? AND id<>?').bind(h, u.id).first();
      if (dup) bad('這組 PIN 已經有人用了，請換一組');
      sets.push('pin_hash=?'); vals.push(h);
    }
    if (!sets.length) return json({ ok: true });
    await db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).bind(...vals, u.id).run();
    return json({ ok: true });
  }
  if (path === '/users' && method === 'DELETE') {
    needOwner();
    const { id } = await req.json();
    if (+id === me.id) bad('不能刪除自己');
    await db.prepare('DELETE FROM users WHERE id=?').bind(+id).run();
    return json({ ok: true });
  }
  // 自己改 PIN（所有人）
  if (path === '/me/pin' && method === 'POST') {
    const { pin } = await req.json();
    if (!validPin(pin)) bad('PIN 要 4 到 8 位數字');
    const h = await pinHash(env, pin);
    if (await db.prepare('SELECT id FROM users WHERE pin_hash=? AND id<>?').bind(h, me.id).first()) bad('這組 PIN 已經有人用了，請換一組');
    await db.prepare('UPDATE users SET pin_hash=? WHERE id=?').bind(h, me.id).run();
    return json({ ok: true });
  }

  if (path === '/me') {
    return json({
      role: s.role, name: s.name, uid: me.id, veh: me.veh || '', isOwner, canDispatch: isDispatch, roleName: ROLE_NAME[s.role],
      warehouse: { addr: env.WAREHOUSE_ADDR, lat: +env.WAREHOUSE_LAT, lng: +env.WAREHOUSE_LNG },
      googleKey: isDispatch ? (env.GOOGLE_MAPS_BROWSER_KEY || '') : '',
      ocr: isDispatch && !!env.ANTHROPIC_API_KEY
    });
  }

  // ----- 當日狀態 -----
  if (path === '/state' && method === 'GET') {
    const date = url.searchParams.get('date') || today();
    const [stops, fleet, sups, cnt] = await Promise.all([
      db.prepare('SELECT * FROM stops WHERE date=? ORDER BY veh, seq').bind(date).all(),
      db.prepare("SELECT value FROM settings WHERE key='fleet'").first(),
      isDispatch ? db.prepare('SELECT * FROM suppliers ORDER BY name').all() : { results: [] },
      isDispatch ? db.prepare('SELECT COUNT(*) n, SUM(lat IS NULL) nogeo, SUM(open<>\'\') hours FROM customers').first() : null
    ]);
    return json({ date, stops: stops.results.map(rowToStop), fleet: JSON.parse(fleet.value), suppliers: sups.results, customers: cnt });
  }

  // ----- 站點 -----
  if (path === '/stops' && method === 'POST') {
    needDispatch();
    const list = await req.json();
    if (!Array.isArray(list) || !list.length) bad('沒有資料');
    const stmt = db.prepare(`INSERT INTO stops (id,date,kind,needs,customer_code,supplier_id,shop,phone,addr,lat,lng,open,close,items,bulky,urgent,veh,seq,eta,leg_min,leg_km,status,note,done_at,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    await db.batch(list.map(x => {
      const o = normStop(x);
      return stmt.bind(o.id, o.date, o.kind, o.needs, o.customer_code, o.supplier_id, o.shop, o.phone, o.addr, o.lat, o.lng, o.open, o.close, o.items, o.bulky, o.urgent, o.veh, o.seq, o.eta, o.leg_min, o.leg_km, o.status, o.note, o.done_at, o.source);
    }));
    return json({ ok: true, n: list.length });
  }
  if (path === '/stops' && method === 'PATCH') {
    const list = await req.json();
    if (!Array.isArray(list) || !list.length) bad('沒有資料');
    const allowed = isDispatch
      ? ['kind', 'needs', 'customer_code', 'supplier_id', 'shop', 'phone', 'addr', 'lat', 'lng', 'open', 'close', 'items', 'bulky', 'urgent', 'veh', 'seq', 'eta', 'leg_min', 'leg_km', 'status', 'note', 'done_at']
      : ['status', 'note', 'done_at'];
    const stmts = [];
    for (const p of list) {
      if (!p.id) bad('缺 id');
      const keys = Object.keys(p).filter(k => allowed.includes(k));
      if (!keys.length) continue;
      const vals = keys.map(k => typeof p[k] === 'boolean' ? (p[k] ? 1 : 0) : p[k]);
      stmts.push(db.prepare(`UPDATE stops SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now') WHERE id=?`).bind(...vals, p.id));
    }
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true, n: stmts.length });
  }
  if (path === '/stops' && method === 'DELETE') {
    needDispatch();
    const { ids } = await req.json();
    if (!Array.isArray(ids) || !ids.length) bad('沒有 id');
    await db.batch(ids.map(id => db.prepare('DELETE FROM stops WHERE id=?').bind(id)));
    return json({ ok: true });
  }

  // ----- 客戶 -----
  if (path === '/customers' && method === 'GET') {
    needDispatch();
    const q = (url.searchParams.get('q') || '').trim();
    const mode = url.searchParams.get('mode') || '';
    const limit = Math.min(+url.searchParams.get('limit') || 200, 2000);
    let sql = 'SELECT * FROM customers', args = [];
    if (q) { sql += ' WHERE code LIKE ? OR name LIKE ? OR addr LIKE ?'; const like = '%' + q + '%'; args = [like, like, like]; }
    else if (mode === 'nogeo') sql += ' WHERE lat IS NULL AND addr<>\'\'';
    else if (mode === 'nohours') sql += " WHERE open='' ";
    sql += ' ORDER BY code LIMIT ?'; args.push(limit);
    const r = await db.prepare(sql).bind(...args).all();
    return json(r.results);
  }
  if (path === '/customers/lookup' && method === 'POST') {
    // 照片讀到的店名/編號 → 客戶檔
    needDispatch();
    const { codes = [], names = [] } = await req.json();
    const out = {};
    for (const c of codes.slice(0, 50)) {
      const code = normCode(c); if (!code) continue;
      const r = await db.prepare('SELECT * FROM customers WHERE code=?').bind(code).first();
      if (r) out['code:' + c] = r;
    }
    for (const n of names.slice(0, 50)) {
      const nm = String(n || '').replace(/\s|\(.*?\)|（.*?）/g, '');
      if (nm.length < 2) continue;
      const r = await db.prepare('SELECT * FROM customers WHERE REPLACE(name,\' \',\'\') LIKE ? ORDER BY LENGTH(name) LIMIT 3').bind('%' + nm + '%').all();
      if (r.results.length) out['name:' + n] = r.results;
    }
    return json(out);
  }
  if (path === '/customers/import' && method === 'POST') {
    needDispatch();
    const rows = await req.json();
    if (!Array.isArray(rows)) bad('格式錯誤');
    const stmt = db.prepare(`INSERT INTO customers (code,name,phone,addr,open,close,closed_days,note) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(code) DO UPDATE SET name=excluded.name, phone=excluded.phone,
        addr=excluded.addr,
        lat=CASE WHEN customers.addr=excluded.addr THEN customers.lat ELSE NULL END,
        lng=CASE WHEN customers.addr=excluded.addr THEN customers.lng ELSE NULL END,
        open=CASE WHEN excluded.open<>'' THEN excluded.open ELSE customers.open END,
        close=CASE WHEN excluded.close<>'' THEN excluded.close ELSE customers.close END,
        closed_days=CASE WHEN excluded.closed_days<>'' THEN excluded.closed_days ELSE customers.closed_days END,
        note=CASE WHEN excluded.note<>'' THEN excluded.note ELSE customers.note END,
        updated_at=datetime('now')`);
    let n = 0; const batch = [];
    for (const r of rows) {
      const code = normCode(r.code), name = String(r.name || '').trim();
      if (!code || !name) continue;
      batch.push(stmt.bind(code, name, str(r.phone), str(r.addr), normTime(r.open), normTime(r.close), str(r.closed_days), str(r.note)));
      n++;
      if (batch.length >= 100) { await db.batch(batch.splice(0)); }
    }
    if (batch.length) await db.batch(batch);
    return json({ ok: true, n });
  }
  if (path === '/customers' && method === 'PATCH') {
    needDispatch();
    const list = await req.json();
    const allowed = ['name', 'phone', 'addr', 'lat', 'lng', 'open', 'close', 'closed_days', 'note'];
    const stmts = [];
    for (const p of list) {
      const code = normCode(p.code); if (!code) continue;
      const keys = Object.keys(p).filter(k => allowed.includes(k));
      if (!keys.length) continue;
      stmts.push(db.prepare(`UPDATE customers SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now') WHERE code=?`).bind(...keys.map(k => k === 'open' || k === 'close' ? normTime(p[k]) : p[k]), code));
    }
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true, n: stmts.length });
  }
  if (path === '/customers' && method === 'DELETE') {
    needOwner();
    const { codes } = await req.json();
    await db.batch(codes.map(c => db.prepare('DELETE FROM customers WHERE code=?').bind(normCode(c))));
    return json({ ok: true });
  }

  // ----- 供應商 -----
  if (path === '/suppliers' && method === 'POST') {
    needDispatch();
    const p = await req.json();
    if (!p.name || !p.addr) bad('供應商要有名稱和地址');
    const r = await db.prepare('INSERT INTO suppliers (name,phone,addr,lat,lng,open,close,closed_days,note) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(p.name.trim(), str(p.phone), p.addr.trim(), p.lat ?? null, p.lng ?? null, normTime(p.open), normTime(p.close), str(p.closed_days), str(p.note)).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (path === '/suppliers/import' && method === 'POST') {
    needDispatch();
    const rows = await req.json();
    if (!Array.isArray(rows)) bad('格式錯誤');
    let n = 0, upd = 0;
    for (const r of rows) {
      const name = str(r.name), addr = str(r.addr);
      if (!name) continue;
      const ex = await db.prepare('SELECT id, addr FROM suppliers WHERE name=?').bind(name).first();
      if (ex) {
        const sameAddr = !addr || ex.addr === addr;
        await db.prepare(`UPDATE suppliers SET phone=CASE WHEN ?<>'' THEN ? ELSE phone END, addr=CASE WHEN ?<>'' THEN ? ELSE addr END,
          lat=CASE WHEN ? THEN lat ELSE NULL END, lng=CASE WHEN ? THEN lng ELSE NULL END,
          open=CASE WHEN ?<>'' THEN ? ELSE open END, close=CASE WHEN ?<>'' THEN ? ELSE close END,
          closed_days=CASE WHEN ?<>'' THEN ? ELSE closed_days END, note=CASE WHEN ?<>'' THEN ? ELSE note END, updated_at=datetime('now') WHERE id=?`)
          .bind(str(r.phone), str(r.phone), addr, addr, sameAddr ? 1 : 0, sameAddr ? 1 : 0, normTime(r.open), normTime(r.open), normTime(r.close), normTime(r.close), str(r.closed_days), str(r.closed_days), str(r.note), str(r.note), ex.id).run();
        upd++;
      } else {
        if (!addr) continue;
        await db.prepare('INSERT INTO suppliers (name,phone,addr,open,close,closed_days,note) VALUES (?,?,?,?,?,?,?)')
          .bind(name, str(r.phone), addr, normTime(r.open), normTime(r.close), str(r.closed_days), str(r.note)).run();
        n++;
      }
    }
    return json({ ok: true, n, upd });
  }
  if (path === '/suppliers' && method === 'PATCH') {
    needDispatch();
    const list = await req.json();
    const allowed = ['name', 'phone', 'addr', 'lat', 'lng', 'open', 'close', 'closed_days', 'note'];
    const stmts = [];
    for (const p of list) {
      const keys = Object.keys(p).filter(k => allowed.includes(k));
      if (!p.id || !keys.length) continue;
      stmts.push(db.prepare(`UPDATE suppliers SET ${keys.map(k => k + '=?').join(',')}, updated_at=datetime('now') WHERE id=?`).bind(...keys.map(k => k === 'open' || k === 'close' ? normTime(p[k]) : p[k]), p.id));
    }
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true });
  }
  if (path === '/suppliers' && method === 'DELETE') {
    needDispatch();
    const { id } = await req.json();
    await db.prepare('DELETE FROM suppliers WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  // ----- 設定 -----
  if (path === '/settings/fleet' && method === 'PUT') {
    needDispatch();
    const f = await req.json();
    if (!f || !f.names || !f.active) bad('格式錯誤');
    await db.prepare("INSERT INTO settings(key,value) VALUES('fleet',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(f)).run();
    return json({ ok: true });
  }

  // ----- 照片辨識 -----
  if (path === '/ocr' && method === 'POST') {
    needDispatch();
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(500, '尚未設定 ANTHROPIC_API_KEY，照片辨識無法使用');
    const form = await req.formData();
    const files = form.getAll('images').filter(f => f && typeof f === 'object' && f.size > 0).slice(0, 8);
    if (!files.length) bad('沒有照片');
    const note = String(form.get('note') || '').slice(0, 500);
    const sups = (await db.prepare('SELECT name, addr FROM suppliers').all()).results;
    const content = [];
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) bad('照片超過 20MB：' + f.name);
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type) ? f.type : 'image/jpeg';
      content.push({ type: 'image', source: { type: 'base64', media_type: type, data: btoa(bin) } });
    }
    content.push({ type: 'text', text: ocrPrompt(sups, note) });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', max_tokens: 6000, messages: [{ role: 'user', content }] })
    });
    if (!r.ok) throw new HttpError(502, '辨識服務回應錯誤 ' + r.status + '：' + (await r.text()).slice(0, 300));
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const orders = parseJsonArray(text);
    if (!orders) throw new HttpError(502, '辨識結果無法解析，請再試一次');
    return json({ orders });
  }

  throw new HttpError(404, '找不到 ' + path);
}

// ---------- helpers ----------
function today() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
const str = v => String(v ?? '').trim();
function normCode(c) { return String(c || '').toUpperCase().replace(/[\s\-_]/g, '').trim(); }
function normTime(t) {
  if (t == null) return '';
  if (typeof t === 'number') { const m = Math.round(t * 24 * 60); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); } // Excel 時間小數
  const s = String(t).trim(); if (!s) return '';
  let m = /^(\d{1,2})[:：.](\d{2})/.exec(s); if (m) return pad(+m[1]) + ':' + m[2];
  m = /^(\d{1,2})$/.exec(s); if (m) return pad(+m[1]) + ':00';
  m = /^(\d{3,4})$/.exec(s); if (m) { const v = s.padStart(4, '0'); return v.slice(0, 2) + ':' + v.slice(2); }
  return '';
}
const pad = n => String(n).padStart(2, '0');
function normStop(x) {
  if (!x.id || !x.date || !x.shop || !x.addr) bad('站點缺 id/date/shop/addr');
  return {
    id: String(x.id), date: String(x.date), kind: x.kind === 'pickup' ? 'pickup' : 'deliver', needs: str(x.needs),
    customer_code: normCode(x.customer_code), supplier_id: x.supplier_id ?? null, shop: str(x.shop), phone: str(x.phone), addr: str(x.addr),
    lat: x.lat ?? null, lng: x.lng ?? null, open: normTime(x.open), close: normTime(x.close), items: str(x.items),
    bulky: x.bulky ? 1 : 0, urgent: x.urgent ? 1 : 0, veh: VEH.includes(x.veh) ? x.veh : '', seq: +x.seq || 0,
    eta: str(x.eta), leg_min: x.leg_min ?? null, leg_km: x.leg_km ?? null,
    status: ['pending', 'done', 'fail'].includes(x.status) ? x.status : 'pending', note: str(x.note), done_at: str(x.done_at), source: str(x.source)
  };
}
function rowToStop(r) { return { ...r, bulky: !!r.bulky, urgent: !!r.urgent }; }
function parseJsonArray(text) {
  const tryParse = s => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : (v && Array.isArray(v.orders) ? v.orders : null); } catch { return null; } };
  let v = tryParse(text); if (v) return v;
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text); if (fence) { v = tryParse(fence[1]); if (v) return v; }
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a >= 0 && b > a) { v = tryParse(text.slice(a, b + 1)); if (v) return v; }
  return null;
}
function ocrPrompt(sups, note) {
  const supTxt = sups.map(s => `${s.name}｜${s.addr}`).join('\n') || '（尚無）';
  return `你在幫「瑞城企業」（新北市板橋的機車零件批發商）整理今天要配送的單據。附上的照片是他們 ERP 印出的「詢價單／出貨單」（藍色複寫紙），也可能有手寫便條或 LINE 截圖。
每張出貨單的左上角有：客戶編號（例如 "F J5"、"B GU-18"、"D VZ-7"）、客戶名稱、聯絡電話、地址。品名欄列出貨物；手寫勾選、劃掉、改數字都算數：被整行劃掉的品項不算，數字被手寫改過就用手寫的。備註手寫「另訂」「調貨」「缺」代表那項這次不送。
請輸出 JSON 陣列，一筆代表一個「要送去的客戶」（同一客戶多張單合併），格式：
{"code":"客戶編號，保留原樣，沒有就空字串","shop":"客戶名稱","phone":"電話或空字串","addr":"完整地址，看不到就空字串","open":"","close":"","items":"這次要送的貨物摘要，含數量","bulky":false,"urgent":false,"pickup":null,"unsure":""}
- bulky：輪胎、整箱機油（例如「20 箱」）、體積大的貨為 true。
- urgent：有「急」「趕」「馬上」「中午前」或勾了「急用」為 true。
- open/close：只有照片上明確寫營業時間才填（24 小時制 "HH:MM"），否則空字串，不要猜。
- pickup：如果單上或便條寫要先去某供應商／廠商拿貨、調貨、代取，再送給這個客戶，填 {"name":"供應商名稱","addr":"供應商地址，不知道就空字串","items":"要取的貨"}；否則 null。
- unsure：看不清楚或用推測的地方，一句話說明；沒有就空字串。
- 客戶資料被其他單子壓住看不到的，仍然輸出一筆，能讀到什麼填什麼，並在 unsure 說明「地址被遮住」。
- 不要編造照片上沒有的地址、電話或時間。
已知供應商（名稱｜地址）：
${supTxt}
${note ? '排車員補充：' + note + '\n' : ''}只回 JSON 陣列，不要其他文字。`;
}
