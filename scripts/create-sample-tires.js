/**
 * 建立範例輪胎 Excel 資料檔案 (data/tires.xlsx)
 * 執行: node scripts/create-sample-tires.js
 */

const XLSX = require('xlsx');
const path = require('path');

const sampleData = [
  { 品牌: 'Michelin', 型號: 'Pilot Sport 4', 尺寸: '205/55R16', 價格: 4200, 庫存: 8 },
  { 品牌: 'Michelin', 型號: 'Pilot Sport 4', 尺寸: '225/45R17', 價格: 5200, 庫存: 6 },
  { 品牌: 'Michelin', 型號: 'Energy Saver+', 尺寸: '195/65R15', 價格: 3500, 庫存: 12 },
  { 品牌: 'Bridgestone', 型號: 'Turanza T005', 尺寸: '205/55R16', 價格: 3800, 庫存: 5 },
  { 品牌: 'Bridgestone', 型號: 'Potenza Sport', 尺寸: '225/45R17', 價格: 5500, 庫存: 4 },
  { 品牌: 'Bridgestone', 型號: 'Ecopia EP150', 尺寸: '185/65R15', 價格: 2900, 庫存: 15 },
  { 品牌: 'Continental', 型號: 'PremiumContact 6', 尺寸: '205/55R16', 價格: 4500, 庫存: 7 },
  { 品牌: 'Continental', 型號: 'SportContact 7', 尺寸: '235/40R18', 價格: 6800, 庫存: 3 },
  { 品牌: 'Dunlop', 型號: 'SP Sport Maxx', 尺寸: '225/55R17', 價格: 4100, 庫存: 9 },
  { 品牌: 'Dunlop', 型號: 'SP Sport LM705', 尺寸: '195/65R15', 價格: 3200, 庫存: 20 },
  { 品牌: 'Yokohama', 型號: 'ADVAN Sport V105', 尺寸: '225/45R18', 價格: 5800, 庫存: 6 },
  { 品牌: 'Yokohama', 型號: 'BluEarth-A', 尺寸: '205/60R16', 價格: 3600, 庫存: 11 },
  { 品牌: 'Hankook', 型號: 'Ventus S1 evo3', 尺寸: '235/45R17', 價格: 4000, 庫存: 8 },
  { 品牌: 'Pirelli', 型號: 'P Zero', 尺寸: '245/40R18', 價格: 7200, 庫存: 4 },
  { 品牌: 'Goodyear', 型號: 'EfficientGrip', 尺寸: '205/55R16', 價格: 3900, 庫存: 10 },
];

const ws = XLSX.utils.json_to_sheet(sampleData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '輪胎報價');

const outPath = path.join(__dirname, '../data/tires.xlsx');
XLSX.writeFile(wb, outPath);
console.log('✅ 已建立範例 Excel:', outPath);
console.log('📋 欄位格式：品牌 | 型號 | 尺寸 | 價格 | 庫存');
console.log('👉 請用你的實際資料替換此檔案，保持相同欄位名稱');
