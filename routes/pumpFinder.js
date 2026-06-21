const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const DATA_FILE = path.join(__dirname, '../public/pump-finder/data.json');
const COLUMNS = ['id', 'name', 'oemCode', 'brand', 'models', 'price', 'notes', 'imageUrl'];

function readPumps() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writePumps(pumps) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(pumps, null, 2), 'utf8');
}

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function pumpsToCsv(pumps) {
  const rows = [COLUMNS.join(',')];
  for (const p of pumps) {
    const row = [
      p.id,
      p.name,
      p.oemCode,
      p.brand,
      (p.models || []).join('、'),
      p.price == null ? '' : p.price,
      p.notes || '',
      p.imageUrl || '',
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  // Leading BOM so Excel opens the UTF-8 (Chinese) text correctly.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore, \n terminates the row
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function nextId(pumps) {
  let max = 0;
  for (const p of pumps) {
    const m = /^FP-(\d+)$/.exec(p.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `FP-${String(max + 1).padStart(3, '0')}`;
}

router.get('/export', (_req, res) => {
  const csv = pumpsToCsv(readPumps());
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pump-data.csv"');
  res.send(csv);
});

router.post('/save', requireAuth, (req, res) => {
  const { pumps } = req.body;
  if (!Array.isArray(pumps)) {
    return res.status(400).json({ error: 'pumps must be an array' });
  }
  writePumps(pumps);
  res.json({ ok: true, count: pumps.length });
});

router.post('/import', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length === 0) return res.status(400).json({ error: 'Empty file' });

  const header = rows[0].map(h => h.trim());
  const idx = {};
  for (const col of COLUMNS) idx[col] = header.indexOf(col);
  if (idx.oemCode === -1 || idx.name === -1) {
    return res.status(400).json({ error: '缺少必要欄位（name、oemCode）' });
  }

  const existing = readPumps();
  const byOem = new Map(existing.map(p => [p.oemCode, p]));

  for (const cells of rows.slice(1)) {
    const get = (col) => (idx[col] >= 0 ? (cells[idx[col]] || '').trim() : '');
    const oemCode = get('oemCode');
    if (!oemCode) continue;

    const priceRaw = get('price');
    const parsedPrice = Number(priceRaw);
    const price = priceRaw === '' || Number.isNaN(parsedPrice) ? null : parsedPrice;
    const models = get('models').split(/[、,;]/).map(s => s.trim()).filter(Boolean);
    const current = byOem.get(oemCode);

    const record = {
      id: get('id') || (current ? current.id : nextId(existing)),
      name: get('name'),
      oemCode,
      brand: get('brand'),
      models,
      yearRange: current?.yearRange ?? '-',
      displacement: current?.displacement ?? '-',
      voltage: current?.voltage ?? '12V',
      connectorType: current?.connectorType ?? '-',
      outletType: current?.outletType ?? '-',
      mountingType: current?.mountingType ?? '-',
      color: current?.color ?? '-',
      imageUrl: get('imageUrl') || current?.imageUrl || 'images/placeholder.svg',
      price,
      notes: get('notes'),
    };

    if (current) {
      existing[existing.indexOf(current)] = record;
    } else {
      existing.push(record);
      byOem.set(oemCode, record);
    }
  }

  writePumps(existing);
  res.json({ ok: true, pumps: existing });
});

module.exports = router;
