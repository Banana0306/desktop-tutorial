const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const TIRE_FILE = path.join(__dirname, '../data/tires.xlsx');

let tiresCache = null;

function loadTires() {
  if (tiresCache) return tiresCache;

  if (!fs.existsSync(TIRE_FILE)) {
    console.error('找不到輪胎資料檔案:', TIRE_FILE);
    return [];
  }

  const wb = XLSX.readFile(TIRE_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  // Normalize column names (支援中英文欄位名稱)
  tiresCache = rows.map(row => ({
    brand: row['品牌'] || row['brand'] || row['Brand'] || '',
    model: row['型號'] || row['model'] || row['Model'] || row['花紋'] || '',
    size: row['尺寸'] || row['size'] || row['Size'] || row['規格'] || '',
    price: Number(row['價格'] || row['price'] || row['Price'] || 0),
    stock: Number(row['庫存'] || row['stock'] || row['Stock'] || row['數量'] || 0),
  })).filter(t => t.brand || t.size);

  console.log(`✅ 載入輪胎資料 ${tiresCache.length} 筆`);
  return tiresCache;
}

// Force reload (useful when Excel file is updated)
function reloadTires() {
  tiresCache = null;
  return loadTires();
}

/**
 * Search tires by keyword — matches brand, model, or size
 * @param {object} params
 * @param {string} [params.brand] - brand name
 * @param {string} [params.size]  - tire size e.g. 205/55R16
 * @param {string} [params.model] - model/pattern name
 */
function searchTires({ brand, size, model } = {}) {
  const tires = loadTires();

  return tires.filter(t => {
    const bMatch = !brand || t.brand.toLowerCase().includes(brand.toLowerCase());
    const sMatch = !size  || normalize(t.size).includes(normalize(size));
    const mMatch = !model || t.model.toLowerCase().includes(model.toLowerCase());
    return bMatch && sMatch && mMatch;
  });
}

// Normalize tire size: remove spaces, uppercase
function normalize(str) {
  return str.replace(/\s+/g, '').toUpperCase();
}

module.exports = { searchTires, reloadTires, loadTires };
