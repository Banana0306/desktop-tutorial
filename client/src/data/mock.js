// ── Products ────────────────────────────────────────────
export const products = [
  { id: 'PT-001', name: '煞車碟盤 260mm',    category: '煞車系統', price: 1850, stock: 42, safetyStock: 20, unit: '片',  status: '正常'  },
  { id: 'PT-002', name: '來令片組 前輪',     category: '煞車系統', price: 680,  stock: 15, safetyStock: 30, unit: '組',  status: '低庫存'},
  { id: 'PT-003', name: '煞車油管 鐵編',     category: '煞車系統', price: 920,  stock:  8, safetyStock: 15, unit: '條',  status: '低庫存'},
  { id: 'PT-004', name: '大盤齒盤 A組',      category: '傳動系統', price: 2400, stock: 33, safetyStock: 10, unit: '組',  status: '正常'  },
  { id: 'PT-005', name: '傳動皮帶 普利珠',   category: '傳動系統', price: 380,  stock: 80, safetyStock: 40, unit: '套',  status: '正常'  },
  { id: 'PT-006', name: 'V型皮帶 27×8.5',   category: '傳動系統', price: 290,  stock:  5, safetyStock: 25, unit: '條',  status: '低庫存'},
  { id: 'PT-007', name: '活塞組 57mm',       category: '引擎零件', price: 3200, stock: 18, safetyStock: 10, unit: '組',  status: '正常'  },
  { id: 'PT-008', name: '汽缸頭組件',        category: '引擎零件', price: 5800, stock:  7, safetyStock: 5,  unit: '組',  status: '正常'  },
  { id: 'PT-009', name: '機油濾心',          category: '引擎零件', price: 120,  stock: 200,safetyStock: 50, unit: '個',  status: '正常'  },
  { id: 'PT-010', name: '空氣濾清器',        category: '引擎零件', price: 450,  stock: 65, safetyStock: 30, unit: '個',  status: '正常'  },
  { id: 'PT-011', name: '火星塞 NGK CR8E',   category: '引擎零件', price: 180,  stock: 120,safetyStock: 60, unit: '個',  status: '正常'  },
  { id: 'PT-012', name: '啟動馬達',          category: '電氣系統', price: 2200, stock:  4, safetyStock: 8,  unit: '個',  status: '低庫存'},
  { id: 'PT-013', name: '電瓶 12V 5AH',     category: '電氣系統', price: 950,  stock: 38, safetyStock: 20, unit: '個',  status: '正常'  },
  { id: 'PT-014', name: 'CDI 點火模組',     category: '電氣系統', price: 1400, stock: 22, safetyStock: 10, unit: '個',  status: '正常'  },
  { id: 'PT-015', name: '大燈組 LED 35W',   category: '電氣系統', price: 1680, stock:  0, safetyStock: 8,  unit: '組',  status: '缺貨'  },
  { id: 'PT-016', name: '前土除 ABS黑',     category: '外殼車身', price: 780,  stock: 27, safetyStock: 10, unit: '個',  status: '正常'  },
  { id: 'PT-017', name: '後行李箱蓋',       category: '外殼車身', price: 1200, stock: 14, safetyStock: 8,  unit: '個',  status: '正常'  },
  { id: 'PT-018', name: '前輪胎 100/90-12', category: '輪胎輪框', price: 1450, stock: 30, safetyStock: 15, unit: '條',  status: '正常'  },
  { id: 'PT-019', name: '後輪胎 120/70-12', category: '輪胎輪框', price: 1650, stock: 11, safetyStock: 15, unit: '條',  status: '低庫存'},
  { id: 'PT-020', name: '鋁合金輪框 12吋',  category: '輪胎輪框', price: 4200, stock: 16, safetyStock: 6,  unit: '個',  status: '正常'  },
]

// ── Sales Orders ────────────────────────────────────────
export const orders = [
  { id: 'SO-2024-025', date: '2024-11-20', customer: '台北機車行',   items: 5, amount: 18600, status: '待確認' },
  { id: 'SO-2024-024', date: '2024-11-19', customer: '新竹速克達',   items: 3, amount:  8400, status: '待出貨' },
  { id: 'SO-2024-023', date: '2024-11-18', customer: '台中零件批發', items: 8, amount: 32500, status: '運送中' },
  { id: 'SO-2024-022', date: '2024-11-17', customer: '高雄機車廠',   items: 2, amount:  4800, status: '已完成' },
  { id: 'SO-2024-021', date: '2024-11-16', customer: '桃園維修站',   items: 6, amount: 22100, status: '已完成' },
  { id: 'SO-2024-020', date: '2024-11-15', customer: '台北機車行',   items: 4, amount: 12400, status: '已完成' },
  { id: 'SO-2024-019', date: '2024-11-14', customer: '彰化零件行',   items: 7, amount: 28900, status: '已完成' },
  { id: 'SO-2024-018', date: '2024-11-13', customer: '台南速克達',   items: 3, amount:  9600, status: '已取消' },
  { id: 'SO-2024-017', date: '2024-11-12', customer: '新竹速克達',   items: 5, amount: 19800, status: '已完成' },
  { id: 'SO-2024-016', date: '2024-11-11', customer: '台中零件批發', items: 9, amount: 41200, status: '已完成' },
  { id: 'SO-2024-015', date: '2024-11-10', customer: '高雄機車廠',   items: 2, amount:  5600, status: '已完成' },
  { id: 'SO-2024-014', date: '2024-11-09', customer: '基隆維修廠',   items: 4, amount: 16300, status: '已完成' },
  { id: 'SO-2024-013', date: '2024-11-08', customer: '台北機車行',   items: 6, amount: 23700, status: '待出貨' },
  { id: 'SO-2024-012', date: '2024-11-07', customer: '桃園維修站',   items: 3, amount:  8100, status: '運送中' },
  { id: 'SO-2024-011', date: '2024-11-06', customer: '台南速克達',   items: 5, amount: 18900, status: '已完成' },
  { id: 'SO-2024-010', date: '2024-11-05', customer: '彰化零件行',   items: 4, amount: 14600, status: '已完成' },
  { id: 'SO-2024-009', date: '2024-11-04', customer: '新竹速克達',   items: 7, amount: 31400, status: '已完成' },
  { id: 'SO-2024-008', date: '2024-11-03', customer: '台中零件批發', items: 2, amount:  7200, status: '已取消' },
  { id: 'SO-2024-007', date: '2024-11-02', customer: '高雄機車廠',   items: 8, amount: 36800, status: '已完成' },
  { id: 'SO-2024-006', date: '2024-11-01', customer: '台北機車行',   items: 5, amount: 21500, status: '已完成' },
  { id: 'SO-2024-005', date: '2024-10-31', customer: '基隆維修廠',   items: 3, amount:  9900, status: '已完成' },
  { id: 'SO-2024-004', date: '2024-10-30', customer: '桃園維修站',   items: 6, amount: 27300, status: '已完成' },
  { id: 'SO-2024-003', date: '2024-10-29', customer: '台南速克達',   items: 4, amount: 13800, status: '已完成' },
  { id: 'SO-2024-002', date: '2024-10-28', customer: '彰化零件行',   items: 5, amount: 20100, status: '已完成' },
  { id: 'SO-2024-001', date: '2024-10-27', customer: '台中零件批發', items: 7, amount: 34600, status: '已完成' },
]

// ── Purchase Orders ─────────────────────────────────────
export const purchaseOrders = [
  { id: 'PO-2024-015', supplier: '山葉原廠零件',  items: 12, amount:  86400, eta: '2024-12-05', status: '運送中' },
  { id: 'PO-2024-014', supplier: 'NGK Japan',      items:  5, amount:  24800, eta: '2024-12-10', status: '運送中' },
  { id: 'PO-2024-013', supplier: '三陽工業',       items:  8, amount:  52300, eta: '2024-12-15', status: '備貨中' },
  { id: 'PO-2024-012', supplier: '光陽原廠',       items:  6, amount:  38600, eta: '2024-12-20', status: '備貨中' },
  { id: 'PO-2024-011', supplier: 'DID 鏈條',       items:  4, amount:  19200, eta: '2024-12-25', status: '待確認' },
  { id: 'PO-2024-010', supplier: 'Bridgestone TW', items:  3, amount:  22500, eta: '2024-12-28', status: '待確認' },
  { id: 'PO-2024-009', supplier: '山葉原廠零件',   items: 10, amount:  71000, eta: '2024-11-28', status: '已到貨' },
  { id: 'PO-2024-008', supplier: 'NGK Japan',       items:  8, amount:  36400, eta: '2024-11-25', status: '已到貨' },
  { id: 'PO-2024-007', supplier: '三陽工業',        items:  6, amount:  44200, eta: '2024-11-22', status: '已到貨' },
  { id: 'PO-2024-006', supplier: '光陽原廠',        items:  9, amount:  58900, eta: '2024-11-20', status: '已到貨' },
  { id: 'PO-2024-005', supplier: 'DID 鏈條',        items:  5, amount:  24600, eta: '2024-11-18', status: '已到貨' },
  { id: 'PO-2024-004', supplier: 'Bridgestone TW',  items:  4, amount:  29800, eta: '2024-11-15', status: '已到貨' },
  { id: 'PO-2024-003', supplier: '山葉原廠零件',    items:  7, amount:  49300, eta: '2024-11-10', status: '已到貨' },
  { id: 'PO-2024-002', supplier: 'NGK Japan',        items:  6, amount:  27200, eta: '2024-11-05', status: '已到貨' },
  { id: 'PO-2024-001', supplier: '三陽工業',         items:  5, amount:  38100, eta: '2024-11-01', status: '已到貨' },
]

// ── Customers ───────────────────────────────────────────
export const customers = [
  { id: 'C-001', name: '台北機車行',   phone: '02-2345-6789', city: '台北市', creditLimit: 200000, paymentDays: 30, lastOrder: '2024-11-20' },
  { id: 'C-002', name: '新竹速克達',   phone: '03-5678-9012', city: '新竹市', creditLimit: 150000, paymentDays: 30, lastOrder: '2024-11-19' },
  { id: 'C-003', name: '台中零件批發', phone: '04-2233-4455', city: '台中市', creditLimit: 500000, paymentDays: 60, lastOrder: '2024-11-18' },
  { id: 'C-004', name: '高雄機車廠',   phone: '07-3344-5566', city: '高雄市', creditLimit: 300000, paymentDays: 45, lastOrder: '2024-11-17' },
  { id: 'C-005', name: '桃園維修站',   phone: '03-3456-7890', city: '桃園市', creditLimit: 100000, paymentDays: 30, lastOrder: '2024-11-16' },
  { id: 'C-006', name: '彰化零件行',   phone: '04-7234-5678', city: '彰化縣', creditLimit: 180000, paymentDays: 30, lastOrder: '2024-11-14' },
  { id: 'C-007', name: '台南速克達',   phone: '06-2233-4455', city: '台南市', creditLimit: 250000, paymentDays: 45, lastOrder: '2024-11-13' },
  { id: 'C-008', name: '基隆維修廠',   phone: '02-2429-3456', city: '基隆市', creditLimit:  80000, paymentDays: 30, lastOrder: '2024-11-12' },
  { id: 'C-009', name: '宜蘭機車行',   phone: '03-9234-5678', city: '宜蘭縣', creditLimit:  60000, paymentDays: 30, lastOrder: '2024-11-05' },
  { id: 'C-010', name: '嘉義零件廠',   phone: '05-2233-4455', city: '嘉義市', creditLimit: 120000, paymentDays: 30, lastOrder: '2024-10-28' },
  { id: 'C-011', name: '屏東速克達',   phone: '08-7345-6789', city: '屏東縣', creditLimit:  90000, paymentDays: 45, lastOrder: '2024-10-25' },
  { id: 'C-012', name: '花蓮機車廠',   phone: '03-8234-5678', city: '花蓮縣', creditLimit:  50000, paymentDays: 30, lastOrder: '2024-10-20' },
  { id: 'C-013', name: '台東維修站',   phone: '08-9345-6789', city: '台東縣', creditLimit:  40000, paymentDays: 30, lastOrder: '2024-10-15' },
  { id: 'C-014', name: '苗栗機車行',   phone: '037-234567',   city: '苗栗縣', creditLimit:  70000, paymentDays: 30, lastOrder: '2024-10-12' },
  { id: 'C-015', name: '南投零件行',   phone: '049-234-5678', city: '南投縣', creditLimit:  80000, paymentDays: 30, lastOrder: '2024-10-08' },
  { id: 'C-016', name: '雲林速克達',   phone: '05-5234-5678', city: '雲林縣', creditLimit: 100000, paymentDays: 30, lastOrder: '2024-10-03' },
  { id: 'C-017', name: '澎湖機車廠',   phone: '06-9234-5678', city: '澎湖縣', creditLimit:  30000, paymentDays: 60, lastOrder: '2024-09-28' },
  { id: 'C-018', name: '金門維修站',   phone: '082-234567',   city: '金門縣', creditLimit:  25000, paymentDays: 60, lastOrder: '2024-09-20' },
]

// ── 30-day Sales Trend (for Overview LineChart) ─────────
export const salesTrend = [
  { date: '10/22', amount: 18400 }, { date: '10/23', amount: 23100 }, { date: '10/24', amount: 31500 },
  { date: '10/25', amount: 28700 }, { date: '10/26', amount: 19200 }, { date: '10/27', amount: 34600 },
  { date: '10/28', amount: 20100 }, { date: '10/29', amount: 13800 }, { date: '10/30', amount: 27300 },
  { date: '10/31', amount: 9900  }, { date: '11/01', amount: 21500 }, { date: '11/02', amount: 36800 },
  { date: '11/03', amount: 7200  }, { date: '11/04', amount: 31400 }, { date: '11/05', amount: 14600 },
  { date: '11/06', amount: 18900 }, { date: '11/07', amount: 8100  }, { date: '11/08', amount: 23700 },
  { date: '11/09', amount: 16300 }, { date: '11/10', amount: 5600  }, { date: '11/11', amount: 41200 },
  { date: '11/12', amount: 19800 }, { date: '11/13', amount: 9600  }, { date: '11/14', amount: 28900 },
  { date: '11/15', amount: 12400 }, { date: '11/16', amount: 22100 }, { date: '11/17', amount: 4800  },
  { date: '11/18', amount: 32500 }, { date: '11/19', amount: 8400  }, { date: '11/20', amount: 18600 },
]

// ── Category Inventory (for Overview PieChart) ──────────
export const categoryInventory = [
  { name: '煞車系統', value: 65  },
  { name: '傳動系統', value: 118 },
  { name: '引擎零件', value: 410 },
  { name: '電氣系統', value: 64  },
  { name: '外殼車身', value: 41  },
  { name: '輪胎輪框', value: 57  },
]

// ── Monthly Sales (for Reports BarChart) ────────────────
export const monthlySales = [
  { month: '1月',  sales: 248000, orders: 32 },
  { month: '2月',  sales: 186000, orders: 25 },
  { month: '3月',  sales: 312000, orders: 41 },
  { month: '4月',  sales: 298000, orders: 38 },
  { month: '5月',  sales: 354000, orders: 47 },
  { month: '6月',  sales: 328000, orders: 44 },
  { month: '7月',  sales: 389000, orders: 52 },
  { month: '8月',  sales: 402000, orders: 54 },
  { month: '9月',  sales: 378000, orders: 49 },
  { month: '10月', sales: 421000, orders: 56 },
  { month: '11月', sales: 458000, orders: 61 },
  { month: '12月', sales: 390000, orders: 50 },
]

// ── Daily Orders (for Reports LineChart) ────────────────
export const dailyOrders = [
  { date: '10/22', count: 4 }, { date: '10/23', count: 6 }, { date: '10/24', count: 8 },
  { date: '10/25', count: 7 }, { date: '10/26', count: 3 }, { date: '10/27', count: 9 },
  { date: '10/28', count: 5 }, { date: '10/29', count: 3 }, { date: '10/30', count: 7 },
  { date: '10/31', count: 2 }, { date: '11/01', count: 5 }, { date: '11/02', count: 10 },
  { date: '11/03', count: 2 }, { date: '11/04', count: 8 }, { date: '11/05', count: 4 },
  { date: '11/06', count: 5 }, { date: '11/07', count: 2 }, { date: '11/08', count: 6 },
  { date: '11/09', count: 4 }, { date: '11/10', count: 1 }, { date: '11/11', count: 11 },
  { date: '11/12', count: 5 }, { date: '11/13', count: 2 }, { date: '11/14', count: 7 },
  { date: '11/15', count: 3 }, { date: '11/16', count: 6 }, { date: '11/17', count: 1 },
  { date: '11/18', count: 8 }, { date: '11/19', count: 2 }, { date: '11/20', count: 5 },
]

// ── Top 10 Products (for Reports ranking) ───────────────
export const topProducts = [
  { rank: 1,  name: '機油濾心',         category: '引擎零件', qty: 520, revenue: 62400  },
  { rank: 2,  name: '火星塞 NGK CR8E',  category: '引擎零件', qty: 480, revenue: 86400  },
  { rank: 3,  name: '傳動皮帶 普利珠',  category: '傳動系統', qty: 410, revenue: 155800 },
  { rank: 4,  name: '空氣濾清器',       category: '引擎零件', qty: 385, revenue: 173250 },
  { rank: 5,  name: '煞車碟盤 260mm',   category: '煞車系統', qty: 284, revenue: 525400 },
  { rank: 6,  name: '來令片組 前輪',    category: '煞車系統', qty: 271, revenue: 184280 },
  { rank: 7,  name: '電瓶 12V 5AH',    category: '電氣系統', qty: 218, revenue: 207100 },
  { rank: 8,  name: '前輪胎 100/90-12',category: '輪胎輪框', qty: 196, revenue: 284200 },
  { rank: 9,  name: '大盤齒盤 A組',     category: '傳動系統', qty: 178, revenue: 427200 },
  { rank: 10, name: '後輪胎 120/70-12',category: '輪胎輪框', qty: 164, revenue: 270600 },
]

// ── Exchange Rates ───────────────────────────────────────
export const exchangeRates = {
  USD: { buy: 31.85, sell: 32.15, change: +0.12  },
  JPY: { buy: 0.2134, sell: 0.2156, change: -0.0023 },
  EUR: { buy: 34.21, sell: 34.65, change: +0.08  },
  updatedAt: '2024-11-20 09:30',
}

// ── Customs Records ─────────────────────────────────────
export const customsRecords = [
  { id: 'IMP-2024-010', shipment: 'TPTYO241120', origin: 'Japan',  items: 8,  declaredValue: 38400, tariff: 2304, status: '清關完成' },
  { id: 'IMP-2024-009', shipment: 'TPEUR241108', origin: 'EU',     items: 5,  declaredValue: 22600, tariff: 1356, status: '清關完成' },
  { id: 'IMP-2024-008', shipment: 'TPTYO241025', origin: 'Japan',  items: 12, declaredValue: 56800, tariff: 3408, status: '清關完成' },
  { id: 'IMP-2024-007', shipment: 'TPUSA241018', origin: 'USA',    items: 4,  declaredValue: 14200, tariff:  852, status: '清關完成' },
  { id: 'IMP-2024-006', shipment: 'TPTYO241005', origin: 'Japan',  items: 9,  declaredValue: 41500, tariff: 2490, status: '清關完成' },
  { id: 'IMP-2024-005', shipment: 'TPEUR240920', origin: 'EU',     items: 6,  declaredValue: 28900, tariff: 1734, status: '清關完成' },
  { id: 'IMP-2024-004', shipment: 'TPTYO240908', origin: 'Japan',  items: 7,  declaredValue: 32600, tariff: 1956, status: '清關完成' },
  { id: 'IMP-2024-003', shipment: 'TPUSA240822', origin: 'USA',    items: 3,  declaredValue:  9800, tariff:  588, status: '清關完成' },
  { id: 'IMP-2024-002', shipment: 'TPTYO240810', origin: 'Japan',  items: 10, declaredValue: 48000, tariff: 2880, status: '清關完成' },
  { id: 'IMP-2024-001', shipment: 'TPEUR240725', origin: 'EU',     items: 4,  declaredValue: 18600, tariff: 1116, status: '清關完成' },
]

// ── Derived helpers ─────────────────────────────────────
export const lowStockProducts = products.filter(p => p.stock < p.safetyStock)
export const latestOrders = orders.slice(0, 5)
