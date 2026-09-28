// Google Maps 包裝：載入、地址轉座標、車程表（汽車／機車）、完整路線
(function (g) {
  let loading = null;
  function load(key) {
    if (g.google && g.google.maps && g.google.maps.importLibrary) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      // 官方的 inline bootstrap（讓 importLibrary 可用）
      ((gg) => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in gg) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), gg[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a) })); d[l] ? console.warn(p + " only loads once. Ignoring:", gg) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)) })({ key, v: 'weekly', region: 'TW', language: 'zh-TW' });
      google.maps.importLibrary('core').then(() => resolve()).catch(reject);
    });
    return loading;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function geocode(addr) {
    const { Geocoder } = await google.maps.importLibrary('geocoding');
    const gc = new Geocoder();
    const q = String(addr || '').trim(); if (!q) return null;
    try {
      const { results } = await gc.geocode({ address: q, region: 'TW', componentRestrictions: { country: 'TW' } });
      if (!results || !results[0]) return null;
      const r = results[0], loc = r.geometry.location;
      const partial = !!r.partial_match || !(r.types || []).some(t => ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest'].includes(t));
      return { lat: loc.lat(), lng: loc.lng(), formatted: r.formatted_address, partial };
    } catch (e) {
      if (String(e).includes('ZERO_RESULTS')) return null;
      if (String(e).includes('OVER_QUERY_LIMIT')) { await sleep(1200); return geocode(addr); }
      throw e;
    }
  }
  // 逐筆轉座標；onEach(i, total, result)
  async function geocodeMany(items, onEach) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      let r = null;
      try { r = await geocode(items[i].addr); } catch (e) { r = { error: String(e && e.message || e) }; }
      out.push(r); if (onEach) onEach(i, items.length, r);
      await sleep(120);
    }
    return out;
  }

  // 車程表：points [{lat,lng}]，回傳 {min:[][], km:[][]}；mode 'car'|'moto'
  async function matrix(points, mode, departure) {
    const { RouteMatrix } = await google.maps.importLibrary('routes');
    const n = points.length;
    const min = Array.from({ length: n }, () => Array(n).fill(null));
    const km = Array.from({ length: n }, () => Array(n).fill(null));
    const travelMode = mode === 'moto' ? 'TWO_WHEELER' : 'DRIVING';
    const future = departure && departure.getTime() > Date.now() + 60e3;
    const base = { travelMode, fields: ['durationMillis', 'distanceMeters', 'condition'] };
    if (future) { base.routingPreference = 'TRAFFIC_AWARE'; base.departureTime = departure; }
    else if (departure && departure.getTime() > Date.now() - 6 * 3600e3) { base.routingPreference = 'TRAFFIC_AWARE'; }
    else base.routingPreference = 'TRAFFIC_UNAWARE';
    const chunk = Math.max(1, Math.floor(625 / n));       // origins × destinations ≤ 625
    for (let o = 0; o < n; o += chunk) {
      const oIdx = []; for (let i = o; i < Math.min(n, o + chunk); i++) oIdx.push(i);
      const req = Object.assign({}, base, { origins: oIdx.map(i => points[i]), destinations: points.slice() });
      let res;
      try { res = await RouteMatrix.computeRouteMatrix(req); }
      catch (e) {
        if (mode === 'moto') { // 機車模式失敗時退回汽車模式
          req.travelMode = 'DRIVING'; res = await RouteMatrix.computeRouteMatrix(req); res.__fallback = true;
        } else throw e;
      }
      const rows = (res.matrix && res.matrix.rows) || [];
      rows.forEach((row, ri) => {
        const i = oIdx[ri];
        (row.items || []).forEach((it, j) => {
          if (it.condition && String(it.condition).includes('NOT_FOUND')) return;
          if (it.durationMillis == null) return;
          min[i][j] = it.durationMillis / 60000; km[i][j] = (it.distanceMeters || 0) / 1000;
        });
      });
      if (res.__fallback) km.__fallback = true;
    }
    for (let i = 0; i < n; i++) { min[i][i] = 0; km[i][i] = 0; }
    return { min, km, fallback: !!km.__fallback };
  }

  // 完整路線：origin/dest 倉庫、intermediates 站點；回傳每段時間與路徑
  async function route(points, mode, departure) {
    const { Route } = await google.maps.importLibrary('routes');
    const travelMode = mode === 'moto' ? 'TWO_WHEELER' : 'DRIVING';
    const future = departure && departure.getTime() > Date.now() + 60e3;
    const req = {
      origin: points[0], destination: points[points.length - 1],
      intermediates: points.slice(1, -1).map(p => ({ location: p, vehicleStopover: true })),
      travelMode, fields: ['durationMillis', 'distanceMeters', 'legs', 'path'],
      routingPreference: (future || (departure && departure.getTime() > Date.now() - 6 * 3600e3)) ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE'
    };
    if (future) req.departureTime = departure;
    let res;
    try { res = await Route.computeRoutes(req); }
    catch (e) { if (mode === 'moto') { req.travelMode = 'DRIVING'; res = await Route.computeRoutes(req); } else throw e; }
    const r = res.routes && res.routes[0]; if (!r) return null;
    return {
      legs: (r.legs || []).map(l => ({ min: l.durationMillis / 60000, km: (l.distanceMeters || 0) / 1000 })),
      totalMin: r.durationMillis / 60000, totalKm: (r.distanceMeters || 0) / 1000,
      path: (r.path || []).map(p => (typeof p.lat === 'function') ? { lat: p.lat(), lng: p.lng() } : p)
    };
  }
  g.GM = { load, geocode, geocodeMany, matrix, route };
})(window);
