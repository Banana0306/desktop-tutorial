// 排車核心 v3：以成本分車 + 車與車之間互換 + 平衡回倉時間 + 每台車精確排序
// 車程來源：Google 車程表（汽車 DRIVING / 機車 TWO_WHEELER）；沒有時退回直線估算。
(function (g) {
  const VEH = ['car', 'm1', 'm2'];
  const MODE = { car: 'car', m1: 'moto', m2: 'moto' };
  const EST_SPEED = { car: 22, moto: 26 };

  // 目標函數權重（分鐘為單位）
  const W = {
    late: 30,        // 晚到打烊，每分鐘罰 30
    urgent: 1.0,     // 急件越晚送到罰越多（每分鐘）
    makespan: 3,     // 最晚回倉的那台車，額外計 3 倍 → 先讓最晚那台早點回來
    balance: 30,     // 每台車工時（小時）平方 × 30 → 工作量盡量平均分給有出車的司機
    motoFar: 2.5,    // 機車跑超過設定距離，每公里罰 2.5 分（軟限制，不是硬規則）
  };

  const tmin = h => { if (!h) return null; const m = /^(\d{1,2})[:：]?(\d{2})$/.exec(String(h).trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fmtT = m => { m = Math.round(m); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  // ctx = { warehouse:{lat,lng}, matrix:{car:{min,km}, moto:{min,km}} | null, index: Map(stopId→i), perStop:{car,m1,m2}, motoRadiusKm }
  function makeTravel(ctx) {
    if (ctx._travel) return ctx._travel;
    const pt = s => s === 'W' ? ctx.warehouse : s;
    const idx = s => s === 'W' ? 0 : ctx.index.get(s.id);
    const cache = new Map();
    const f = function travel(v, a, b) {           // → {min, km}
      const mode = MODE[v];
      const i = idx(a), j = idx(b);
      const key = mode + '|' + (a === 'W' ? 'W' : a.id) + '|' + (b === 'W' ? 'W' : b.id);
      const c = cache.get(key); if (c) return c;
      let r;
      const m = ctx.matrix && ctx.matrix[mode];
      if (m && i != null && j != null && m.min[i] && m.min[i][j] != null) r = { min: m.min[i][j], km: m.km[i][j] };
      else {
        const A = pt(a), B = pt(b);
        if (A && B && A.lat != null && B.lat != null) { const km = Math.max(hav(A, B) * 1.3, 0.6); r = { min: km / EST_SPEED[mode] * 60, km, est: true }; }
        else r = { min: 20, km: 6, est: true };
      }
      cache.set(key, r); return r;
    };
    ctx._travel = f; return f;
  }
  const win = s => { const o = tmin(s.open), c = tmin(s.close); return [o == null ? 0 : o, c == null ? 1440 : c]; };

  function simulate(ctx, v, route, startMin, startPt) {
    const travel = makeTravel(ctx), per = ctx.perStop[v] || 6;
    let t = startMin, p = startPt || 'W', km = 0, late = 0, wait = 0, est = false, urg = 0;
    const rows = {};
    for (const s of route) {
      const l = travel(v, p, s); km += l.km; t += l.min; est = est || !!l.est;
      const [o, cl] = win(s);
      let w = 0; if (t < o) { w = o - t; t = o; }
      const lt = t > cl ? t - cl : 0;
      rows[s.id] = { eta: t, wait: w, late: lt, legMin: l.min, legKm: l.km };
      if (s.urgent) urg += t - startMin;
      wait += w; late += lt; t += per; p = s;
    }
    if (route.length) { const l = travel(v, p, 'W'); km += l.km; t += l.min; }
    return { rows, end: t, km, late, wait, est, urg };
  }
  function precedenceOk(route, doneIds) {
    const seen = new Set(doneIds);
    for (const s of route) { if (s.needs && !seen.has(s.needs)) return false; seen.add(s.id); }
    return true;
  }

  // ---------- 單台車的成本 ----------
  function farKm(ctx, s) { return makeTravel(ctx)('m1', 'W', s).km; }
  function vehCost(ctx, v, route, st) {
    if (!route.length) return { cost: 0, dur: 0 };
    if (!precedenceOk(route, st.doneIds)) return { cost: Infinity, dur: Infinity };
    const sim = simulate(ctx, v, route, st.t, st.pt);
    let cost = (sim.end - st.t) + sim.late * W.late + sim.urg * W.urgent;
    if (MODE[v] === 'moto') {
      const R = ctx.motoRadiusKm || 10;
      for (const s of route) { const k = farKm(ctx, s); if (k > R) cost += (k - R) * W.motoFar; }
    }
    return { cost, dur: sim.end - st.t, end: sim.end };
  }

  // ---------- 單台車排序：小量用窮舉，大量用區域搜尋 ----------
  function exactOrder(ctx, v, list, st) {
    // 分支界限窮舉（≤8 站）；遵守先取貨再送貨
    const travel = makeTravel(ctx), per = ctx.perStop[v] || 6, n = list.length;
    let best = null, bestCost = Infinity;
    const used = new Array(n).fill(false), seq = [], seen = new Set(st.doneIds);
    const R = ctx.motoRadiusKm || 10, moto = MODE[v] === 'moto';
    const extra = moto ? list.reduce((a, s) => { const k = farKm(ctx, s); return a + (k > R ? (k - R) * W.motoFar : 0); }, 0) : 0;
    (function dfs(p, t, acc) {
      if (acc + extra >= bestCost) return;
      if (seq.length === n) {
        const total = acc + travel(v, p, 'W').min + extra;
        if (total < bestCost) { bestCost = total; best = seq.slice(); }
        return;
      }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const s = list[i];
        if (s.needs && !seen.has(s.needs)) continue;
        const l = travel(v, p, s); let at = t + l.min;
        const [o, cl] = win(s); let w = 0; if (at < o) { w = o - at; at = o; }
        const lt = at > cl ? at - cl : 0;
        const add = l.min + w + per + lt * W.late + (s.urgent ? (at - st.t) * W.urgent : 0);
        used[i] = true; seq.push(s); seen.add(s.id);
        dfs(s, at + per, acc + add);
        used[i] = false; seq.pop(); seen.delete(s.id);
      }
    })(st.pt, st.t, 0);
    return best || list.slice();
  }
  function localOrder(ctx, v, route, st) {
    let best = route.slice(), bc = vehCost(ctx, v, best, st).cost, again = true, guard = 0;
    const tryIt = cand => { const c = vehCost(ctx, v, cand, st).cost; if (c < bc - 0.3) { best = cand; bc = c; again = true; return true; } return false; };
    while (again && guard++ < 60) {
      again = false;
      // Or-opt：搬移長度 1~3 的連續段
      for (let len = 1; len <= 3; len++) for (let i = 0; i + len <= best.length; i++) {
        const seg = best.slice(i, i + len), rest = best.slice(0, i).concat(best.slice(i + len));
        for (let j = 0; j <= rest.length; j++) { if (j === i) continue; if (tryIt(rest.slice(0, j).concat(seg, rest.slice(j)))) break; }
      }
      // 2-opt：反轉一段
      for (let i = 0; i < best.length - 1; i++) for (let k = i + 1; k < best.length; k++)
        tryIt(best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1)));
    }
    return best;
  }
  function orderRoute(ctx, v, route, st) {
    if (route.length <= 1) return route.slice();
    if (route.length <= 8) return exactOrder(ctx, v, route, st);
    // 多個起點各做一次區域搜尋，取最好
    const starts = [route.slice(), nearestSeed(ctx, v, route, st)];
    let best = null, bc = Infinity;
    for (const s0 of starts) { const r = localOrder(ctx, v, s0, st), c = vehCost(ctx, v, r, st).cost; if (c < bc) { bc = c; best = r; } }
    return best;
  }
  function nearestSeed(ctx, v, list, st) {
    const travel = makeTravel(ctx), rest = list.slice(), out = [], seen = new Set(st.doneIds); let p = st.pt;
    while (rest.length) {
      let bi = -1, bd = Infinity;
      rest.forEach((s, i) => { if (s.needs && !seen.has(s.needs)) return; const d = travel(v, p, s).min; if (d < bd) { bd = d; bi = i; } });
      if (bi < 0) bi = 0;
      const s = rest.splice(bi, 1)[0]; out.push(s); seen.add(s.id); p = s;
    }
    return out;
  }

  // ---------- 開始狀態 ----------
  const bySeq = (a, b) => (a.seq || 0) - (b.seq || 0);
  const fixedOf = (stops, v) => stops.filter(s => s.veh === v && s.status !== 'pending').sort(bySeq);
  function startState(stops, v, dayStartMin, nowMin) {
    const f = fixedOf(stops, v), last = f[f.length - 1];
    let t = dayStartMin; if (nowMin != null) t = Math.max(t, nowMin);
    const allDone = stops.filter(s => s.status !== 'pending').map(s => s.id);
    return { pt: last || 'W', t, doneIds: allDone, last: last || null };
  }

  // 取貨＋送貨綁成一組，一定同一台車
  function units(pending, all) {
    const byId = {}; all.forEach(s => byId[s.id] = s);
    const used = new Set(), out = [];
    for (const s of pending) {
      if (used.has(s.id)) continue;
      let grp = [s], forced = null;
      if (s.needs) {
        const p = byId[s.needs];
        if (p && p.status === 'pending' && pending.includes(p)) grp = [p, s];
        else if (p && p.status !== 'pending') forced = p.veh || null;
      } else if (s.kind === 'pickup') { const d = pending.find(x => x.needs === s.id); if (d) grp = [s, d]; }
      grp.forEach(x => used.add(x.id));
      out.push({ stops: grp, bulky: grp.some(x => x.bulky), forced });
    }
    return out;
  }
  function eligible(u, active) {
    if (u.forced) return active[u.forced] ? [u.forced] : [];
    if (u.bulky) return active.car ? ['car'] : [];
    return VEH.filter(v => active[v]);
  }

  // ---------- 整體解 ----------
  function totalCost(ctx, routes, states, vs) {
    let sum = 0, mx = 0;
    for (const v of vs) { const c = vehCost(ctx, v, routes[v], states[v]); sum += c.cost + W.balance * (c.dur / 60) ** 2; if (c.dur > mx) mx = c.dur; }
    return sum + mx * W.makespan;
  }
  // 把一組站插到某台車最好的位置（不重排其他站），回傳新路線
  function bestInsert(ctx, v, route, u, st) {
    let best = null, bc = Infinity;
    const n = route.length;
    if (u.stops.length === 1) {
      for (let i = 0; i <= n; i++) {
        const cand = route.slice(0, i).concat([u.stops[0]], route.slice(i));
        const c = vehCost(ctx, v, cand, st).cost; if (c < bc) { bc = c; best = cand; }
      }
    } else {
      const [a, b] = u.stops;
      for (let i = 0; i <= n; i++) for (let j = i; j <= n; j++) {
        const cand = route.slice(0, i).concat([a], route.slice(i, j), [b], route.slice(j));
        const c = vehCost(ctx, v, cand, st).cost; if (c < bc) { bc = c; best = cand; }
      }
    }
    return best;
  }
  function removeUnit(route, u) { const ids = new Set(u.stops.map(s => s.id)); return route.filter(s => !ids.has(s.id)); }

  function rng(seed) { let x = seed * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

  function solve(ctx, us, states, active, vs) {
    const W0 = ctx.warehouse;
    // 建構順序：先放限制多的（大件、取貨組、離倉遠的）
    const baseOrder = us.slice().sort((a, b) =>
      (eligible(a, active).length - eligible(b, active).length) ||
      (b.stops.length - a.stops.length) ||
      (farKm(ctx, b.stops[b.stops.length - 1]) - farKm(ctx, a.stops[a.stops.length - 1])));
    let bestSol = null, bestCost = Infinity;
    const tries = us.length <= 3 ? 1 : 6;
    for (let t = 0; t < tries; t++) {
      let order = baseOrder.slice();
      if (t > 0) { const r = rng(t); order = order.map(u => [u, r()]).sort((a, b) => a[1] - b[1]).map(x => x[0]); if (t === 1) order = baseOrder.slice().reverse(); }
      const routes = {}; vs.forEach(v => routes[v] = []);
      const unassigned = [];
      // 1) 便宜插入
      for (const u of order) {
        const el = eligible(u, active).filter(v => vs.includes(v));
        if (!el.length) { unassigned.push(u); continue; }
        let bv = null, br = null, bc = Infinity;
        for (const v of el) {
          const cand = bestInsert(ctx, v, routes[v], u, states[v]); if (!cand) continue;
          const trial = Object.assign({}, routes, { [v]: cand });
          const c = totalCost(ctx, trial, states, vs);
          if (c < bc) { bc = c; bv = v; br = cand; }
        }
        if (bv) routes[bv] = br; else unassigned.push(u);
      }
      // 2) 每台車排好順序
      vs.forEach(v => routes[v] = orderRoute(ctx, v, routes[v], states[v]));
      let cur = totalCost(ctx, routes, states, vs);
      // 3) 車與車之間搬移 / 互換，直到沒有改善
      const placed = us.filter(u => !unassigned.includes(u));
      const where = u => vs.find(v => routes[v].includes(u.stops[0]));
      let improved = true, guard = 0;
      while (improved && guard++ < 25) {
        improved = false;
        for (const u of placed) {
          const from = where(u); if (!from) continue;
          for (const to of eligible(u, active)) {
            if (to === from || !vs.includes(to)) continue;
            const rf = removeUnit(routes[from], u), rt = bestInsert(ctx, to, routes[to], u, states[to]); if (!rt) continue;
            const trial = Object.assign({}, routes, { [from]: rf, [to]: rt });
            const c = totalCost(ctx, trial, states, vs);
            if (c < cur - 0.5) { routes[from] = orderRoute(ctx, from, rf, states[from]); routes[to] = orderRoute(ctx, to, rt, states[to]); cur = totalCost(ctx, routes, states, vs); improved = true; }
          }
        }
        // 互換兩組
        for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j], va = where(a), vb = where(b);
          if (!va || !vb || va === vb) continue;
          if (!eligible(a, active).includes(vb) || !eligible(b, active).includes(va)) continue;
          const ra = bestInsert(ctx, va, removeUnit(routes[va], a), b, states[va]);
          const rb = bestInsert(ctx, vb, removeUnit(routes[vb], b), a, states[vb]);
          if (!ra || !rb) continue;
          const trial = Object.assign({}, routes, { [va]: ra, [vb]: rb });
          const c = totalCost(ctx, trial, states, vs);
          if (c < cur - 0.5) { routes[va] = orderRoute(ctx, va, ra, states[va]); routes[vb] = orderRoute(ctx, vb, rb, states[vb]); cur = totalCost(ctx, routes, states, vs); improved = true; }
        }
      }
      if (cur < bestCost) { bestCost = cur; bestSol = { routes, unassigned }; }
    }
    return bestSol;
  }

  // 回傳 {id:{veh,seq}}；skip：今日公休等不排的 id
  function autoAssign(ctx, stops, active, dayStartMin, nowMin, skip) {
    skip = skip || new Set(); ctx._travel = null;
    const pending = stops.filter(s => s.status === 'pending' && !skip.has(s.id));
    const vs = VEH.filter(v => active[v] || fixedOf(stops, v).length);
    const states = {}; VEH.forEach(v => states[v] = startState(stops, v, dayStartMin, nowMin));
    const us = units(pending, stops);
    const out = {};
    const sol = us.length ? solve(ctx, us, states, active, vs.filter(v => active[v])) : { routes: {}, unassigned: [] };
    for (const v of VEH) {
      const fixed = fixedOf(stops, v);
      fixed.concat((sol.routes[v]) || []).forEach((s, i) => out[s.id] = { veh: v, seq: i + 1 });
    }
    sol.unassigned.forEach(u => u.stops.forEach(s => out[s.id] = { veh: '', seq: 0 }));
    pending.forEach(s => { if (!out[s.id]) out[s.id] = { veh: '', seq: 0 }; });
    return out;
  }

  // 急件插入：現有路線不動其他車，只挑多花時間最少的那台插入並重排那台
  function insertUrgent(ctx, newStops, stops, active, dayStartMin, nowMin) {
    ctx._travel = null;
    const u = { stops: newStops, bulky: newStops.some(s => s.bulky), forced: null };
    let best = '', bc = Infinity, bestRoute = null;
    for (const v of eligible(u, active)) {
      const st = startState(stops, v, dayStartMin, nowMin);
      const cur = stops.filter(s => s.veh === v && s.status === 'pending').sort(bySeq);
      const base = vehCost(ctx, v, cur, st).cost;
      const cand = bestInsert(ctx, v, cur, u, st); if (!cand) continue;
      const delta = vehCost(ctx, v, cand, st).cost - base;
      if (delta < bc) { bc = delta; best = v; bestRoute = orderRoute(ctx, v, cand, st); }
    }
    if (!best) return { veh: '', seqs: {} };
    const seqs = {}; fixedOf(stops, best).concat(bestRoute).forEach((s, i) => seqs[s.id] = i + 1);
    return { veh: best, seqs };
  }

  function optimizeVehicle(ctx, v, stops, dayStartMin, nowMin) {
    ctx._travel = null;
    const st = startState(stops, v, dayStartMin, nowMin);
    return orderRoute(ctx, v, stops.filter(s => s.veh === v && s.status === 'pending'), st);
  }

  function planOf(ctx, v, list, dayStartMin, nowMin) {
    const pend = list.filter(s => s.status === 'pending');
    const st = startState(list, v, dayStartMin, nowMin);
    const sim = simulate(ctx, v, pend, st.t, st.pt);
    const all = simulate(ctx, v, list, dayStartMin, 'W');
    return { rows: sim.rows, end: sim.end, kmLeft: sim.km, kmAll: all.km, late: sim.late, startT: st.t, est: sim.est };
  }
  g.RC = { VEH, MODE, W, tmin, fmtT, hav, autoAssign, insertUrgent, planOf, simulate, optimizeVehicle, fixedOf, startState };
})(typeof window !== 'undefined' ? window : globalThis);
