-- 瑞城排車台 D1 schema
CREATE TABLE IF NOT EXISTS customers (
  code TEXT PRIMARY KEY,          -- ERP 客戶編號，例如 "F J5" 正規化成 "FJ5"
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  lat REAL, lng REAL,
  open TEXT DEFAULT '',           -- "09:00"
  close TEXT DEFAULT '',          -- "20:30"
  closed_days TEXT DEFAULT '',    -- 公休，逗號分隔 0-6（0=日）
  note TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  lat REAL, lng REAL,
  open TEXT DEFAULT '',
  close TEXT DEFAULT '',
  closed_days TEXT DEFAULT '',
  note TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,             -- YYYY-MM-DD
  kind TEXT NOT NULL DEFAULT 'deliver',  -- deliver | pickup
  needs TEXT DEFAULT '',          -- deliver 站要先完成的 pickup 站 id
  customer_code TEXT DEFAULT '',
  supplier_id INTEGER,
  shop TEXT NOT NULL,
  phone TEXT DEFAULT '',
  addr TEXT NOT NULL,
  lat REAL, lng REAL,
  open TEXT DEFAULT '', close TEXT DEFAULT '',
  items TEXT DEFAULT '',
  bulky INTEGER DEFAULT 0,
  urgent INTEGER DEFAULT 0,
  veh TEXT DEFAULT '',            -- car | m1 | m2 | ''
  seq INTEGER DEFAULT 0,
  eta TEXT DEFAULT '',            -- 預計到達 "HH:MM"（Google 算的）
  leg_min REAL, leg_km REAL,      -- 從上一站過來的車程
  status TEXT DEFAULT 'pending',  -- pending | done | fail
  note TEXT DEFAULT '',
  done_at TEXT DEFAULT '',
  source TEXT DEFAULT '',         -- photo | manual | claude
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stops_date ON stops(date);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings(key, value) VALUES
  ('fleet', '{"names":{"car":"汽車","m1":"機車 A","m2":"機車 B"},"active":{"car":true,"m1":true,"m2":true},"start":"09:30","perStop":{"car":8,"m1":5,"m2":5},"motoRadiusKm":10}');
