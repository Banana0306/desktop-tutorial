const express = require('express');
const { query, getClient } = require('../db/index');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const CAN_MODIFY = requireRole('owner', 'manager', 'warehouse');

// GET /api/inventory-transfers
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT it.*, wf.name AS from_warehouse_name, wt.name AS to_warehouse_name
       FROM inventory_transfers it
       JOIN warehouses wf ON wf.id = it.from_warehouse
       JOIN warehouses wt ON wt.id = it.to_warehouse
       ORDER BY it.created_at DESC`
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/inventory-transfers
router.post('/', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { from_warehouse, to_warehouse, transfer_date, notes, items } = req.body;

    if (!from_warehouse || !to_warehouse || !items?.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '請提供來源倉、目的倉與調撥品項' });
    }

    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const seqRes = await client.query(
      `SELECT COUNT(*)+1 AS seq FROM inventory_transfers WHERE transfer_number LIKE $1`,
      [`TR-${ym}-%`]
    );
    const trNum = `TR-${ym}-${String(seqRes.rows[0].seq).padStart(4, '0')}`;

    const trRes = await client.query(
      `INSERT INTO inventory_transfers (transfer_number, from_warehouse, to_warehouse, status, transfer_date, notes, created_by)
       VALUES ($1,$2,$3,'draft',$4,$5,$6) RETURNING *`,
      [trNum, from_warehouse, to_warehouse,
       transfer_date || new Date().toISOString().slice(0, 10),
       notes || null, req.user.id]
    );
    const tr = trRes.rows[0];

    for (const item of items) {
      // Validate source batch
      const batchRes = await client.query(
        'SELECT * FROM stock_batches WHERE id = $1 AND warehouse_id = $2 AND status = $3 FOR UPDATE',
        [item.from_batch_id, from_warehouse, 'active']
      );
      if (!batchRes.rows[0] || batchRes.rows[0].remaining_qty < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `批次 ${item.from_batch_id} 庫存不足` });
      }
      const srcBatch = batchRes.rows[0];

      await client.query(
        `INSERT INTO inventory_transfer_items (transfer_id, product_id, from_batch_id, quantity, unit_cost_twd)
         VALUES ($1,$2,$3,$4,$5)`,
        [tr.id, srcBatch.product_id, item.from_batch_id, item.quantity, srcBatch.unit_cost_twd]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(tr);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('建立調撥單錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

// POST /api/inventory-transfers/:id/complete
router.post('/:id/complete', CAN_MODIFY, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const trRes = await client.query(
      'SELECT * FROM inventory_transfers WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!trRes.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: '調撥單不存在' }); }
    if (trRes.rows[0].status !== 'draft') {
      await client.query('ROLLBACK'); return res.status(400).json({ error: '此調撥單無法完成' });
    }
    const tr = trRes.rows[0];

    const items = await client.query(
      'SELECT * FROM inventory_transfer_items WHERE transfer_id = $1', [tr.id]
    );

    for (const item of items.rows) {
      // Deduct from source batch
      await client.query(
        `UPDATE stock_batches
         SET remaining_qty = remaining_qty - $1,
             status = CASE WHEN remaining_qty - $1 <= 0 THEN 'depleted'::batch_status ELSE 'active'::batch_status END,
             updated_at = NOW()
         WHERE id = $2`,
        [item.quantity, item.from_batch_id]
      );

      // Create new batch in destination warehouse
      const newBatchRes = await client.query(
        `INSERT INTO stock_batches (product_id, warehouse_id, received_date, quantity, remaining_qty,
           unit_cost_twd, status, source_type, source_id)
         VALUES ($1,$2,$3,$4,$4,$5,'active','transfer',$6) RETURNING id`,
        [item.product_id, tr.to_warehouse,
         tr.transfer_date || new Date().toISOString().slice(0, 10),
         item.quantity, item.unit_cost_twd, tr.id]
      );
      const newBatchId = newBatchRes.rows[0].id;

      // Update transfer item with new batch
      await client.query(
        'UPDATE inventory_transfer_items SET to_batch_id = $1 WHERE id = $2',
        [newBatchId, item.id]
      );

      // Log transactions
      await client.query(
        `INSERT INTO inventory_transactions (txn_type, product_id, warehouse_id, batch_id,
           quantity_change, unit_cost_twd, total_cost_twd, reference_doc_type, reference_doc_id)
         VALUES ('transfer_out', $1, $2, $3, $4, $5, $6, 'transfer', $7)`,
        [item.product_id, tr.from_warehouse, item.from_batch_id,
         -item.quantity, item.unit_cost_twd, -item.quantity * item.unit_cost_twd, tr.id]
      );
      await client.query(
        `INSERT INTO inventory_transactions (txn_type, product_id, warehouse_id, batch_id,
           quantity_change, unit_cost_twd, total_cost_twd, reference_doc_type, reference_doc_id)
         VALUES ('transfer_in', $1, $2, $3, $4, $5, $6, 'transfer', $7)`,
        [item.product_id, tr.to_warehouse, newBatchId,
         item.quantity, item.unit_cost_twd, item.quantity * item.unit_cost_twd, tr.id]
      );
    }

    const updated = await client.query(
      `UPDATE inventory_transfers SET status='completed', completed_at=NOW() WHERE id=$1 RETURNING *`,
      [tr.id]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('完成調撥錯誤:', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  } finally {
    client.release();
  }
});

module.exports = router;
