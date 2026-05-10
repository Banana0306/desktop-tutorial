import { warehouse, suppliers, logisticsCustomers } from '../data/logistics.js'

// Haversine distance in km
function distKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sin2 = (x) => Math.sin(x / 2) ** 2
  const c = 2 * Math.asin(Math.sqrt(sin2(dLat) + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sin2(dLng)))
  return R * c
}

// Assume average speed 60 km/h → minutes per km
const KM_TO_MIN = 60 / 60

function travelMin(a, b) {
  return Math.round(distKm(a, b) * KM_TO_MIN)
}

function fmtTime(minutesFromMidnight) {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Main entry point.
 * @param {Array}  erpOrders   – orders from ERP (from logistics.js)
 * @param {string} cutoffTime  – 'HH:MM' string, departure time from warehouse
 * @returns {{ routes: Route[], supplierPickups: SupplierPickup[], summary: object }}
 */
export function planRoutes(erpOrders, cutoffTime = '08:00') {
  const [ch, cm] = cutoffTime.split(':').map(Number)
  const departureMin = ch * 60 + cm

  // ── 1. Inventory check: find items that need supplier pickup ──────────────
  const neededFromSupplier = [] // { productId, name, qty, supplierId }

  for (const order of erpOrders) {
    for (const item of order.items) {
      if (item.warehouseQty < item.qty) {
        const shortfall = item.qty - item.warehouseQty
        const sup = suppliers.find((s) => s.products.includes(item.productId))
        if (sup) {
          const existing = neededFromSupplier.find(
            (n) => n.productId === item.productId && n.supplierId === sup.id
          )
          if (existing) {
            existing.qty += shortfall
          } else {
            neededFromSupplier.push({
              productId: item.productId,
              name: item.name,
              qty: shortfall,
              supplierId: sup.id,
              supplierName: sup.name,
            })
          }
        }
      }
    }
  }

  // Unique suppliers needed
  const supplierIds = [...new Set(neededFromSupplier.map((n) => n.supplierId))]
  const requiredSuppliers = suppliers.filter((s) => supplierIds.includes(s.id))

  // ── 2. Determine unique customers and their orders ────────────────────────
  const customerIds = [...new Set(erpOrders.map((o) => o.customerId))]
  const requiredCustomers = logisticsCustomers.filter((c) => customerIds.includes(c.id))

  // ── 3. Build stop list: supplier pickups first (nearest-neighbor from WH),
  //        then customer deliveries (nearest-neighbor, respecting open hours) ──

  let currentPos = warehouse
  let currentTime = departureMin
  const stops = []

  // --- Supplier pickups (must happen before customer deliveries) ---
  const remainingSuppliers = [...requiredSuppliers]
  while (remainingSuppliers.length > 0) {
    // pick nearest open supplier
    remainingSuppliers.sort(
      (a, b) => distKm(currentPos, a) - distKm(currentPos, b)
    )
    const sup = remainingSuppliers.shift()
    const travel = travelMin(currentPos, sup)
    const arrivalMin = currentTime + travel
    const openMin = sup.openHour * 60
    const closeMin = sup.closeHour * 60
    const waitMin = arrivalMin < openMin ? openMin - arrivalMin : 0
    const startMin = arrivalMin + waitMin
    const pickupItems = neededFromSupplier.filter((n) => n.supplierId === sup.id)
    const serviceMin = 15 + pickupItems.length * 5
    const departMin = startMin + serviceMin

    stops.push({
      type: 'supplier',
      id: sup.id,
      name: sup.name,
      city: sup.city,
      address: sup.address,
      lat: sup.lat,
      lng: sup.lng,
      travelMin: travel,
      arrivalTime: fmtTime(arrivalMin),
      waitMin,
      startTime: fmtTime(startMin),
      departTime: fmtTime(departMin),
      serviceMin,
      items: pickupItems,
      status: arrivalMin > closeMin ? 'closed' : waitMin > 0 ? 'wait' : 'ok',
    })

    currentPos = sup
    currentTime = departMin
  }

  // --- Customer deliveries (nearest-neighbor with time-window check) ---
  const remainingCustomers = [...requiredCustomers]
  while (remainingCustomers.length > 0) {
    remainingCustomers.sort(
      (a, b) => distKm(currentPos, a) - distKm(currentPos, b)
    )
    const cust = remainingCustomers.shift()
    const travel = travelMin(currentPos, cust)
    const arrivalMin = currentTime + travel
    const openMin = cust.openHour * 60
    const closeMin = cust.closeHour * 60
    const waitMin = arrivalMin < openMin ? openMin - arrivalMin : 0
    const startMin = arrivalMin + waitMin
    const custOrders = erpOrders.filter((o) => o.customerId === cust.id)
    const serviceMin = cust.serviceMinutes
    const departMin = startMin + serviceMin

    stops.push({
      type: 'customer',
      id: cust.id,
      name: cust.name,
      city: cust.city,
      address: cust.address,
      lat: cust.lat,
      lng: cust.lng,
      travelMin: travel,
      arrivalTime: fmtTime(arrivalMin),
      waitMin,
      startTime: fmtTime(startMin),
      departTime: fmtTime(departMin),
      serviceMin,
      orders: custOrders.map((o) => o.id),
      items: custOrders.flatMap((o) => o.items),
      status: startMin > closeMin ? 'closed' : waitMin > 0 ? 'wait' : 'ok',
    })

    currentPos = cust
    currentTime = departMin
  }

  // Return to warehouse
  const returnTravel = travelMin(currentPos, warehouse)
  const returnMin = currentTime + returnTravel

  const totalDistKm = Math.round(
    stops.reduce((sum, s, i) => {
      const prev = i === 0 ? warehouse : stops[i - 1]
      return sum + distKm(prev, s)
    }, 0) + distKm(currentPos, warehouse)
  )

  return {
    departureTime: fmtTime(departureMin),
    returnTime: fmtTime(returnMin),
    totalStops: stops.length,
    supplierStops: stops.filter((s) => s.type === 'supplier').length,
    customerStops: stops.filter((s) => s.type === 'customer').length,
    totalDistKm,
    totalDurationMin: returnMin - departureMin,
    stops,
    supplierPickups: neededFromSupplier,
    outOfStockCount: neededFromSupplier.length,
  }
}
