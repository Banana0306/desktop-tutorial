require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { testConnection } = require('./db/index');

const authRouter            = require('./api/auth');
const productsRouter        = require('./api/products');
const customersRouter       = require('./api/customers');
const suppliersRouter       = require('./api/suppliers');
const warehousesRouter      = require('./api/warehouses');
const purchaseOrdersRouter  = require('./api/purchase-orders');
const goodsReceiptsRouter   = require('./api/goods-receipts');
const purchaseReturnsRouter = require('./api/purchase-returns');
const salesOrdersRouter     = require('./api/sales-orders');
const salesDeliveriesRouter = require('./api/sales-deliveries');
const salesReturnsRouter    = require('./api/sales-returns');
const inventoryRouter       = require('./api/inventory');
const inventoryTransfersRouter = require('./api/inventory-transfers');
const backordersRouter      = require('./api/backorders');
const arInvoicesRouter      = require('./api/ar-invoices');
const arReceiptsRouter      = require('./api/ar-receipts');
const apBillsRouter         = require('./api/ap-bills');
const apPaymentsRouter      = require('./api/ap-payments');
const landedCostsRouter     = require('./api/landed-costs');
const reportsRouter         = require('./api/reports');
const notificationsRouter   = require('./api/notifications');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// Health check
app.get('/api/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({
    ok:   true,
    db:   dbOk ? 'connected' : 'error',
    time: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth',             authRouter);
app.use('/api/products',         productsRouter);
app.use('/api/customers',        customersRouter);
app.use('/api/suppliers',        suppliersRouter);
app.use('/api/warehouses',       warehousesRouter);
app.use('/api/purchase-orders',  purchaseOrdersRouter);
app.use('/api/goods-receipts',   goodsReceiptsRouter);
app.use('/api/purchase-returns', purchaseReturnsRouter);
app.use('/api/sales-orders',    salesOrdersRouter);
app.use('/api/sales-deliveries', salesDeliveriesRouter);
app.use('/api/sales-returns',       salesReturnsRouter);
app.use('/api/inventory',           inventoryRouter);
app.use('/api/inventory-transfers', inventoryTransfersRouter);
app.use('/api/backorders',          backordersRouter);
app.use('/api/ar-invoices',         arInvoicesRouter);
app.use('/api/ar-receipts',         arReceiptsRouter);
app.use('/api/ap-bills',            apBillsRouter);
app.use('/api/ap-payments',         apPaymentsRouter);
app.use('/api/reports',             reportsRouter);
app.use('/api/notifications',       notificationsRouter);
app.use('/api',                     landedCostsRouter);

// Global error handler
app.use((err, req, res, _next) => {
  console.error('未處理的錯誤:', err.stack);
  res.status(500).json({ error: '伺服器內部錯誤' });
});

// Start server
testConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`瑞城 ERP 後端伺服器啟動於 http://localhost:${PORT}`);
  });
});

module.exports = app;
