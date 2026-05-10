const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Haversine distance in km
function distKm(a, b) {
  const R = 6371;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin2 = x => Math.sin(x / 2) ** 2;
  const c = 2 * Math.asin(
    Math.sqrt(sin2(dLat) + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2(dLng))
  );
  return R * c;
}

const KM_TO_MIN = 1; // 60km/h → 1 min/km

function travelMin(a, b) {
  return Math.round(distKm(a, b) * KM_TO_MIN);
}

function fmtTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * POST /api/logistics/plan
 * Body: { orders, suppliers, customers, warehouse, cutoffTime }
 */
router.post('/plan', requireAuth, (req, res) => {
  const { orders, suppliers, customers, warehouse, cutoffTime = '08:00' } = req.body;

  if (!orders || !suppliers || !customers || !warehouse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const [ch, cm] = cutoffTime.split(':').map(Number);
  const departureMin = ch * 60 + cm;

  // Identify items short on stock
  const neededFromSupplier = [];
  for (const order of orders) {
    for (const item of order.items) {
      if (item.warehouseQty < item.qty) {
        const shortfall = item.qty - item.warehouseQty;
        const sup = suppliers.find(s => s.products && s.products.includes(item.productId));
        if (sup) {
          const existing = neededFromSupplier.find(
            n => n.productId === item.productId && n.supplierId === sup.id
          );
          if (existing) {
            existing.qty += shortfall;
          } else {
            neededFromSupplier.push({
              productId: item.productId,
              name: item.name,
              qty: shortfall,
              supplierId: sup.id,
              supplierName: sup.name,
            });
          }
        }
      }
    }
  }

  const supplierIds = [...new Set(neededFromSupplier.map(n => n.supplierId))];
  const requiredSuppliers = suppliers.filter(s => supplierIds.includes(s.id));
  const customerIds = [...new Set(orders.map(o => o.customerId))];
  const requiredCustomers = customers.filter(c => customerIds.includes(c.id));

  let currentPos = warehouse;
  let currentTime = departureMin;
  const stops = [];

  // Supplier pickups (nearest-neighbor)
  const remSup = [...requiredSuppliers];
  while (remSup.length > 0) {
    remSup.sort((a, b) => distKm(currentPos, a) - distKm(currentPos, b));
    const sup = remSup.shift();
    const travel = travelMin(currentPos, sup);
    const arrival = currentTime + travel;
    const openMin = sup.openHour * 60;
    const closeMin = sup.closeHour * 60;
    const wait = arrival < openMin ? openMin - arrival : 0;
    const start = arrival + wait;
    const pickupItems = neededFromSupplier.filter(n => n.supplierId === sup.id);
    const service = 15 + pickupItems.length * 5;
    const depart = start + service;

    stops.push({
      type: 'supplier',
      id: sup.id,
      name: sup.name,
      city: sup.city,
      travelMin: travel,
      arrivalTime: fmtTime(arrival),
      waitMin: wait,
      startTime: fmtTime(start),
      departTime: fmtTime(depart),
      serviceMin: service,
      items: pickupItems,
      status: arrival > closeMin ? 'closed' : wait > 0 ? 'wait' : 'ok',
    });

    currentPos = sup;
    currentTime = depart;
  }

  // Customer deliveries (nearest-neighbor)
  const remCust = [...requiredCustomers];
  while (remCust.length > 0) {
    remCust.sort((a, b) => distKm(currentPos, a) - distKm(currentPos, b));
    const cust = remCust.shift();
    const travel = travelMin(currentPos, cust);
    const arrival = currentTime + travel;
    const openMin = cust.openHour * 60;
    const closeMin = cust.closeHour * 60;
    const wait = arrival < openMin ? openMin - arrival : 0;
    const start = arrival + wait;
    const custOrders = orders.filter(o => o.customerId === cust.id);
    const service = cust.serviceMinutes || 20;
    const depart = start + service;

    stops.push({
      type: 'customer',
      id: cust.id,
      name: cust.name,
      city: cust.city,
      travelMin: travel,
      arrivalTime: fmtTime(arrival),
      waitMin: wait,
      startTime: fmtTime(start),
      departTime: fmtTime(depart),
      serviceMin: service,
      orders: custOrders.map(o => o.id),
      items: custOrders.flatMap(o => o.items),
      status: start > closeMin ? 'closed' : wait > 0 ? 'wait' : 'ok',
    });

    currentPos = cust;
    currentTime = depart;
  }

  const returnTravel = travelMin(currentPos, warehouse);
  const returnMin = currentTime + returnTravel;
  const totalDistKm = Math.round(
    stops.reduce((sum, s, i) => {
      const prev = i === 0 ? warehouse : stops[i - 1];
      return sum + distKm(prev, s);
    }, 0) + distKm(currentPos, warehouse)
  );

  res.json({
    departureTime: fmtTime(departureMin),
    returnTime: fmtTime(returnMin),
    totalStops: stops.length,
    supplierStops: stops.filter(s => s.type === 'supplier').length,
    customerStops: stops.filter(s => s.type === 'customer').length,
    totalDistKm,
    totalDurationMin: returnMin - departureMin,
    stops,
    supplierPickups: neededFromSupplier,
  });
});

/**
 * GET /api/logistics/orders  — return pending ERP orders (mock)
 */
router.get('/orders', requireAuth, (_req, res) => {
  res.json({ message: 'Connect to your ERP system here', orders: [] });
});

module.exports = router;
