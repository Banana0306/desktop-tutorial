// 排車核心：分車、排序、時間窗、先取貨再送貨。
// 車程來源：Google 車程表（汽車 DRIVING / 機車 TWO_WHEELER）；沒有時退回直線估算。
(function (g) {
  const VEH = ['car', 'm1', 'm2'];
  const MODE = { car: 'car', m1: 'moto', m2: 'moto' };
  const EST_SPEED = { car: 22, moto: 26 };

  const tmin = h => { if (!h) return null; const m = /^(\d{1,2})[:：]?(\d{2})$/.exec(String(h).trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fmtT = m => { m = Math.round(m); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  // ctx = { warehouse:{lat,lng}, matrix:{car:{min:[][],km:[][]}, moto:{...}} 或 null, index: Map(stopId→i), perStop:{car,m1,m2} }
  function makeTravel(ctx) {
    const pt = s => s === 'W' ? ctx.warehouse : s;
    const idx = s => s === 'W' ? 0 : ctx.index.get(s.id);
    return function travel(v, a, b) {           // → {min, km}
      const mode = MODE[v];
      const m = ctx.matrix && ctx.matrix[mode];
      const i = idx(a), j = idx(b);
      if (m && i != null && j != null && m.min[i] && m.min[i][j] != null) return { min: m.min[i][j], km: m.km[i][j] };
      const A = pt(a), B = pt(b);
      if (A && B && A.lat != null && B.lat != null) { const km = Math.max(hav(A, B) * 1.3, 0.6); return { min: km / EST_SPEED[mode] * 60, km, est: true }; }
      return { min: 20, km: 6, est: true };
    };
  }
  const win = s => { const o = tmin(s.open), c = tmin(s.close); return [o == null ? 0 : o, c == null ? 1440 : c]; };

  function simulate(ctx, v, route, startMin, startPt) {
    const travel = makeTravel(ctx), per = ctx.perStop[v] || 6;
    let t = startMin, p = startPt || 'W', km = 0, late = 0, wait = 0, est = false;
    const rows = {};
    for (const s of route) {
      const l = travel(v, p, s); km += l.km; t += l.min; est = est || !!l.est;
      const [o, cl] = win(s);
      let w = 0; if (t < o) { w = o - t; t = o; }
      const lt = t > cl ? t - cl : 0;
      rows[s.id] = { eta: t, wait: w, late: lt, legMin: l.min, legKm: l.km };
      wait += w; late += lt; t += per; p = s;
    }
    if (route.length) { const l = travel(v, p, 'W'); km += l.km; t += l.min; }
    return { rows, end: t, km, late, wait, est };
  }
  function precedenceOk(route, doneIds) {
    const seen = new Set(doneIds);
    for (const s of route) { if (s.needs && !seen.has(s.needs)) return false; seen.add(s.id); }
    return true;
  }
  function routeCost(ctx, v, route, startMin, startPt, doneIds) {
    if (!precedenceOk(route, doneIds)) return Infinity;
    const sim = simulate(ctx, v, route, startMin, startPt);
    let urg = 0; route.forEach(s => { if (s.urgent) urg += sim.rows[s.id].eta - startMin; });
    return (sim.end - startMin) + sim.late * 30 + urg * 1.5;
  }
  function greedy(ctx, v, stops, startMin, startPt, doneIds) {
    const travel = makeTravel(ctx), per = ctx.perStop[v] || 6;
    const rest = stops.slice(), out = [], seen = new Set(doneIds);
    let t = startMin, p = startPt;
    while (rest.length) {
      let bi = -1, bs = Infinity;
      rest.forEach((s, i) => {
        if (s.needs && !seen.has(s.needs)) return;
        const l = travel(v, p, s), arr = t + l.min, [o, cl] = win(s);
        const w = Math.max(0, o - arr), at = arr + w;
        let sc = l.min + w * 0.8 + Math.min(Math.max(0, cl - at), 600) * 0.12;
        if (at > cl) sc += 400;
        if (s.urgent) sc -= 120;
        if (sc < bs - 1e-9) { bs = sc; bi = i; }
      });
      if (bi < 0) bi = 0;
      const s = rest.splice(bi, 1)[0];
      const l = travel(v, p, s), [o] = win(s);
      t = Math.max(t + l.min, o) + per; p = s; out.push(s); seen.add(s.id);
    }
    return out;
  }
  function improve(ctx, v, route, startMin, startPt, doneIds) {
    let best = route.slice(), bc = routeCost(ctx, v, best, startMin, startPt, doneIds), again = true, guard = 0;
    while (again && guard++ < 40) {
      again = false;
      for (let i = 0; i < best.length; i++) for (let j = 0; j < best.length; j++) {
        if (i === j) continue;
        const cand = best.slice(); const [x] = cand.splice(i, 1); cand.splice(j, 0, x);
        const cc = routeCost(ctx, v, cand, startMin, startPt, doneIds);
        if (cc < bc - 0.5) { best = cand; bc = cc; again = true; }
      }
      for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cc = routeCost(ctx, v, cand, startMin, startPt, doneIds);
        if (cc < bc - 0.5) { best = cand; bc = cc; again = true; }
      }
    }
    return best;
  }
  const bySeq = (a, b) => (a.seq || 0) - (b.seq || 0);
  const fixedOf = (stops, v) => stops.filter(s => s.veh === v && s.status !== 'pending').sort(bySeq);
  function startState(stops, v, dayStartMin, nowMin) {
    const f = fixedOf(stops, v), last = f[f.length - 1];
    let t = dayStartMin; if (nowMin != null) t = Math.max(t, nowMin);
    return { pt: last || 'W', t, doneIds: f.map(s => s.id), last: last || null };
  }
  function optimizeVehicle(ctx, v, stops, dayStartMin, nowMin) {
    const st = startState(stops, v, dayStartMin, nowMin);
    const pend = stops.filter(s => s.veh === v && s.status === 'pending');
    const allDone = stops.filter(s => s.status !== 'pending').map(s => s.id);
    return improve(ctx, v, greedy(ctx, v, pend, st.t, st.pt, allDone), st.t, st.pt, allDone);
  }
  function units(pending, all) {
    const byId = {}; all.forEach(s => byId[s.id] = s);
    const used = new Set(), out = [];
    for (const s of pending) {
      if (used.has(s.id)) continue;
      let grp = [s];
      if (s.needs) {
        const p = byId[s.needs];
        if (p && p.status === 'pending') grp = [p, s];
        else if (p) { out.push({ stops: [s], forced: p.veh }); used.add(s.id); continue; }
      } else if (s.kind === 'pickup') { const d = pending.find(x => x.needs === s.id); if (d) grp = [s, d]; }
      grp.forEach(x => used.add(x.id)); out.push({ stops: grp });
    }
    return out;
  }
  function kmFromW(ctx, s) {
    const travel = makeTravel(ctx); return travel('m1', 'W', s).km;
  }
  // 回傳 {id:{veh,seq}}；skip: 今日公休等不排的 id 集合
  function autoAssign(ctx, stops, active, dayStartMin, nowMin, skip) {
    skip = skip || new Set();
    const pending = stops.filter(s => s.status === 'pending' && !skip.has(s.id));
    const motos = ['m1', 'm2'].filter(v => active[v]);
    const target = {}, pool = [];
    const setU = (u, v) => u.stops.forEach(s => target[s.id] = v);
    for (const u of units(pending, stops)) {
      if (u.forced) { setU(u, u.forced); continue; }
      const bulky = u.stops.some(s => s.bulky), far = Math.max(...u.stops.map(s => kmFromW(ctx, s))) > (ctx.motoRadiusKm || 10);
      if (bulky) setU(u, active.car ? 'car' : '');
      else if (far && active.car) setU(u, 'car');
      else pool.push(u);
    }
    if (!motos.length) pool.forEach(u => setU(u, active.car ? 'car' : ''));
    else if (motos.length === 1) pool.forEach(u => setU(u, motos[0]));
    else if (pool.length) {
      const W = ctx.warehouse;
      const withA = pool.map(u => { const d = u.stops[u.stops.length - 1]; const c = d.lat != null ? d : W; return { u, a: Math.atan2(c.lat - W.lat, c.lng - W.lng) }; }).sort((x, y) => x.a - y.a);
      let gapI = 0, gap = -1;
      for (let i = 0; i < withA.length; i++) {
        const nx = withA[(i + 1) % withA.length];
        let gp = ((nx.a - withA[i].a) + 2 * Math.PI) % (2 * Math.PI); if (withA.length === 1) gp = 2 * Math.PI;
        if (gp > gap) { gap = gp; gapI = i; }
      }
      const ring = withA.slice(gapI + 1).concat(withA.slice(0, gapI + 1));
      const total = ring.reduce((n, x) => n + x.u.stops.length, 0); let cnt = 0;
      ring.forEach(x => { setU(x.u, cnt < total / 2 ? motos[0] : motos[1]); cnt += x.u.stops.length; });
    }
    const tmp = stops.map(s => s.status === 'pending' && !skip.has(s.id) ? Object.assign({}, s, { veh: target[s.id] || '' }) : s);
    const out = {};
    for (const v of VEH) {
      const fixed = fixedOf(tmp, v);
      const route = optimizeVehicle(ctx, v, tmp, dayStartMin, nowMin);
      fixed.concat(route).forEach((s, i) => out[s.id] = { veh: v, seq: i + 1 });
    }
    tmp.filter(s => s.status === 'pending' && !s.veh).forEach(s => out[s.id] = { veh: '', seq: 0 });
    return out;
  }
  function insertUrgent(ctx, newStops, stops, active, dayStartMin, nowMin) {
    const travel = makeTravel(ctx);
    const bulky = newStops.some(s => s.bulky);
    const cands = bulky ? ['car'] : ['m1', 'm2', 'car'];
    let best = '', bd = Infinity;
    for (const v of cands) {
      if (!active[v]) continue;
      const st = startState(stops, v, dayStartMin, nowMin);
      const d = travel(v, st.pt, newStops[0]).min + (v === 'car' ? 3 : 0);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return { veh: '', seqs: {} };
    const tmp = stops.concat(newStops.map(s => Object.assign({}, s, { veh: best, status: 'pending' })));
    const fixed = fixedOf(tmp, best);
    const route = optimizeVehicle(ctx, best, tmp, dayStartMin, nowMin);
    const seqs = {}; fixed.concat(route).forEach((s, i) => seqs[s.id] = i + 1);
    return { veh: best, seqs };
  }
  function planOf(ctx, v, list, dayStartMin, nowMin) {
    const pend = list.filter(s => s.status === 'pending');
    const st = startState(list, v, dayStartMin, nowMin);
    const sim = simulate(ctx, v, pend, st.t, st.pt);
    const all = simulate(ctx, v, list, dayStartMin, 'W');
    return { rows: sim.rows, end: sim.end, kmLeft: sim.km, kmAll: all.km, late: sim.late, startT: st.t, est: sim.est };
  }
  g.RC = { VEH, MODE, tmin, fmtT, hav, autoAssign, insertUrgent, planOf, simulate, optimizeVehicle, fixedOf, startState };
})(typeof window !== 'undefined' ? window : globalThis);
