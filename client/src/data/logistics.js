// Warehouse home base (台北倉庫)
export const warehouse = {
  id: 'WH-001',
  name: '總倉庫 (台北)',
  address: '台北市內湖區瑞光路513號',
  lat: 25.0810,
  lng: 121.5740,
}

// Suppliers — where we pick up out-of-stock items
export const suppliers = [
  {
    id: 'SUP-001',
    name: '山葉原廠零件',
    city: '新北市',
    address: '新北市新莊區五工路89號',
    lat: 25.0504,
    lng: 121.4437,
    openHour: 8,
    closeHour: 17,
    products: ['PT-006', 'PT-012', 'PT-015'],
  },
  {
    id: 'SUP-002',
    name: 'NGK Japan 台灣倉',
    city: '桃園市',
    address: '桃園市中壢區環中東路2段889號',
    lat: 24.9600,
    lng: 121.2248,
    openHour: 8,
    closeHour: 16,
    products: ['PT-002', 'PT-011'],
  },
  {
    id: 'SUP-003',
    name: '三陽工業零件中心',
    city: '新竹市',
    address: '新竹市東區光復路2段101號',
    lat: 24.7876,
    lng: 121.0052,
    openHour: 9,
    closeHour: 17,
    products: ['PT-003', 'PT-019'],
  },
]

// Customers enriched with coordinates + business hours
export const logisticsCustomers = [
  {
    id: 'C-001',
    name: '台北機車行',
    city: '台北市',
    address: '台北市大安區忠孝東路4段216號',
    lat: 25.0418,
    lng: 121.5497,
    openHour: 9,
    closeHour: 18,
    serviceMinutes: 20,
  },
  {
    id: 'C-002',
    name: '新竹速克達',
    city: '新竹市',
    address: '新竹市北區中山路131號',
    lat: 24.8066,
    lng: 120.9686,
    openHour: 8,
    closeHour: 17,
    serviceMinutes: 25,
  },
  {
    id: 'C-003',
    name: '台中零件批發',
    city: '台中市',
    address: '台中市西區台灣大道2段501號',
    lat: 24.1477,
    lng: 120.6736,
    openHour: 9,
    closeHour: 18,
    serviceMinutes: 30,
  },
  {
    id: 'C-004',
    name: '高雄機車廠',
    city: '高雄市',
    address: '高雄市三民區十全一路102號',
    lat: 22.6273,
    lng: 120.3014,
    openHour: 8,
    closeHour: 17,
    serviceMinutes: 25,
  },
  {
    id: 'C-005',
    name: '桃園維修站',
    city: '桃園市',
    address: '桃園市桃園區中正路1188號',
    lat: 24.9937,
    lng: 121.3010,
    openHour: 9,
    closeHour: 17,
    serviceMinutes: 20,
  },
  {
    id: 'C-006',
    name: '彰化零件行',
    city: '彰化縣',
    address: '彰化縣彰化市中山路2段388號',
    lat: 24.0817,
    lng: 120.5382,
    openHour: 8,
    closeHour: 17,
    serviceMinutes: 20,
  },
  {
    id: 'C-007',
    name: '基隆維修廠',
    city: '基隆市',
    address: '基隆市仁愛區忠一路23號',
    lat: 25.1276,
    lng: 121.7392,
    openHour: 9,
    closeHour: 18,
    serviceMinutes: 20,
  },
  {
    id: 'C-008',
    name: '台南速克達',
    city: '台南市',
    address: '台南市中西區中正路299號',
    lat: 22.9999,
    lng: 120.2133,
    openHour: 9,
    closeHour: 18,
    serviceMinutes: 25,
  },
]

// ERP orders pending shipment (generated after cutoff)
export const erpOrders = [
  {
    id: 'SO-2024-025',
    customerId: 'C-001',
    date: '2024-11-20',
    items: [
      { productId: 'PT-001', name: '煞車碟盤 260mm',    qty: 3, warehouseQty: 42 },
      { productId: 'PT-015', name: '大燈組 LED 35W',   qty: 2, warehouseQty: 0  },  // out-of-stock
      { productId: 'PT-009', name: '機油濾心',          qty: 5, warehouseQty: 200 },
    ],
  },
  {
    id: 'SO-2024-024',
    customerId: 'C-002',
    date: '2024-11-19',
    items: [
      { productId: 'PT-006', name: 'V型皮帶 27×8.5',   qty: 4, warehouseQty: 5  },  // low, need supplier top-up
      { productId: 'PT-011', name: '火星塞 NGK CR8E',  qty: 2, warehouseQty: 120 },
      { productId: 'PT-002', name: '來令片組 前輪',     qty: 6, warehouseQty: 15  },  // low, need supplier
    ],
  },
  {
    id: 'SO-2024-013',
    customerId: 'C-001',
    date: '2024-11-08',
    items: [
      { productId: 'PT-012', name: '啟動馬達',          qty: 3, warehouseQty: 4  },  // low, need supplier
      { productId: 'PT-005', name: '傳動皮帶 普利珠',  qty: 2, warehouseQty: 80  },
    ],
  },
  {
    id: 'SO-2024-012',
    customerId: 'C-005',
    date: '2024-11-07',
    items: [
      { productId: 'PT-019', name: '後輪胎 120/70-12', qty: 4, warehouseQty: 11  },  // low
      { productId: 'PT-010', name: '空氣濾清器',        qty: 3, warehouseQty: 65  },
    ],
  },
  {
    id: 'SO-2024-026',
    customerId: 'C-007',
    date: '2024-11-20',
    items: [
      { productId: 'PT-003', name: '煞車油管 鐵編',     qty: 5, warehouseQty: 8  },  // low
      { productId: 'PT-013', name: '電瓶 12V 5AH',     qty: 2, warehouseQty: 38  },
    ],
  },
]
