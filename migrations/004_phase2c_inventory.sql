-- Phase 2C: FIFO Inventory core (most critical module)
-- stock_batches, inventory_transactions (append-only), backorders, transfers

BEGIN;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE batch_status AS ENUM ('active', 'depleted', 'reserved', 'returned');
CREATE TYPE txn_type AS ENUM (
  'gr_in', 'sd_out', 'sr_in', 'pr_out',
  'transfer_out', 'transfer_in',
  'adjust_in', 'adjust_out',
  'backorder_settle', 'opening'
);
CREATE TYPE backorder_status AS ENUM ('pending', 'settled', 'cancelled');
CREATE TYPE transfer_status AS ENUM ('draft', 'in_transit', 'completed', 'cancelled');

-- ============================================================
-- Stock Batches (FIFO batches)
-- ============================================================

CREATE TABLE stock_batches (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id),
  warehouse_id    BIGINT NOT NULL REFERENCES warehouses(id),
  gr_item_id      BIGINT REFERENCES goods_receipt_items(id),
  batch_no        VARCHAR(50),
  received_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity        NUMERIC(14,4) NOT NULL,
  remaining_qty   NUMERIC(14,4) NOT NULL,
  unit_cost_twd   NUMERIC(14,4) NOT NULL,
  status          batch_status NOT NULL DEFAULT 'active',
  source_type     VARCHAR(30),
  source_id       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Inventory Transactions (APPEND-ONLY — no UPDATE, no DELETE)
-- ============================================================

CREATE TABLE inventory_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  txn_date            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  txn_type            txn_type NOT NULL,
  product_id          BIGINT NOT NULL REFERENCES products(id),
  warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
  batch_id            BIGINT REFERENCES stock_batches(id),
  quantity_change     NUMERIC(14,4) NOT NULL,
  unit_cost_twd       NUMERIC(14,4),
  total_cost_twd      NUMERIC(14,4),
  reference_doc_type  VARCHAR(30),
  reference_doc_id    BIGINT,
  notes               TEXT,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Intentionally NO updated_at / deleted_at (append-only table)
);

-- Prevent any UPDATE or DELETE on inventory_transactions
CREATE OR REPLACE FUNCTION trg_prevent_txn_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '庫存異動帳本為只增不改紀錄，禁止修改或刪除 (inventory_transactions is append-only)';
END;
$$;

CREATE TRIGGER trg_no_update_inv_txn
  BEFORE UPDATE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION trg_prevent_txn_mutation();

CREATE TRIGGER trg_no_delete_inv_txn
  BEFORE DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION trg_prevent_txn_mutation();

-- ============================================================
-- Backorders (auto-created when stock insufficient)
-- ============================================================

CREATE TABLE backorders (
  id              BIGSERIAL PRIMARY KEY,
  sd_item_id      BIGINT NOT NULL REFERENCES sales_delivery_items(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  warehouse_id    BIGINT NOT NULL REFERENCES warehouses(id),
  quantity        NUMERIC(14,4) NOT NULL,
  estimated_cost_twd NUMERIC(14,4),
  status          backorder_status NOT NULL DEFAULT 'pending',
  settled_gr_id   BIGINT REFERENCES goods_receipts(id),
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COGS Adjustments (when backorder settles with different cost)
-- ============================================================

CREATE TABLE sales_cogs_adjustments (
  id              BIGSERIAL PRIMARY KEY,
  sd_item_id      BIGINT NOT NULL REFERENCES sales_delivery_items(id),
  backorder_id    BIGINT REFERENCES backorders(id),
  batch_id        BIGINT REFERENCES stock_batches(id),
  quantity        NUMERIC(14,4) NOT NULL,
  estimated_cost  NUMERIC(14,4) NOT NULL,
  actual_cost     NUMERIC(14,4) NOT NULL,
  variance        NUMERIC(14,4) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Inventory Transfers (cross-warehouse, e.g. BOND → MAIN)
-- ============================================================

CREATE TABLE inventory_transfers (
  id              BIGSERIAL PRIMARY KEY,
  transfer_number VARCHAR(30) NOT NULL UNIQUE,
  from_warehouse  BIGINT NOT NULL REFERENCES warehouses(id),
  to_warehouse    BIGINT NOT NULL REFERENCES warehouses(id),
  status          transfer_status NOT NULL DEFAULT 'draft',
  transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  completed_at    TIMESTAMPTZ,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_transfer_items (
  id              BIGSERIAL PRIMARY KEY,
  transfer_id     BIGINT NOT NULL REFERENCES inventory_transfers(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  from_batch_id   BIGINT NOT NULL REFERENCES stock_batches(id),
  to_batch_id     BIGINT REFERENCES stock_batches(id),
  quantity        NUMERIC(14,4) NOT NULL,
  unit_cost_twd   NUMERIC(14,4) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes (critical for FIFO performance)
-- ============================================================

-- FIFO batch lookup: product + warehouse, ordered by date ASC
CREATE INDEX idx_stock_batches_fifo ON stock_batches(product_id, warehouse_id, received_date ASC, id ASC)
  WHERE status = 'active';
CREATE INDEX idx_stock_batches_product ON stock_batches(product_id);
CREATE INDEX idx_stock_batches_warehouse ON stock_batches(warehouse_id);
CREATE INDEX idx_stock_batches_status ON stock_batches(status);

CREATE INDEX idx_inv_txn_product ON inventory_transactions(product_id);
CREATE INDEX idx_inv_txn_warehouse ON inventory_transactions(warehouse_id);
CREATE INDEX idx_inv_txn_date ON inventory_transactions(txn_date DESC);
CREATE INDEX idx_inv_txn_ref ON inventory_transactions(reference_doc_type, reference_doc_id);
CREATE INDEX idx_inv_txn_batch ON inventory_transactions(batch_id);

CREATE INDEX idx_backorders_product ON backorders(product_id);
CREATE INDEX idx_backorders_status ON backorders(status) WHERE status = 'pending';
CREATE INDEX idx_backorders_sd_item ON backorders(sd_item_id);

CREATE INDEX idx_transfers_status ON inventory_transfers(status);
CREATE INDEX idx_transfer_items_transfer ON inventory_transfer_items(transfer_id);

-- ============================================================
-- Core FIFO function: consume_inventory_fifo
-- Returns JSON: { consumed: [...], backorder_qty: N, total_cogs: N, estimated_cost: N }
-- ============================================================

CREATE OR REPLACE FUNCTION consume_inventory_fifo(
  p_product_id   BIGINT,
  p_warehouse_id BIGINT,
  p_quantity     NUMERIC,
  p_sd_item_id   BIGINT,
  p_created_by   BIGINT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_remaining     NUMERIC := p_quantity;
  v_total_cogs    NUMERIC := 0;
  v_consumed      JSONB   := '[]'::JSONB;
  v_batch         RECORD;
  v_consume_qty   NUMERIC;
  v_cost          NUMERIC;
  v_backorder_qty NUMERIC := 0;
  v_estimated_cost NUMERIC := 0;
BEGIN
  -- Consume from active batches in FIFO order
  FOR v_batch IN
    SELECT id, remaining_qty, unit_cost_twd, received_date
    FROM stock_batches
    WHERE product_id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND status = 'active'
      AND remaining_qty > 0
    ORDER BY received_date ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_consume_qty := LEAST(v_batch.remaining_qty, v_remaining);
    v_cost        := v_consume_qty * v_batch.unit_cost_twd;

    -- Deduct from batch
    UPDATE stock_batches
    SET remaining_qty = remaining_qty - v_consume_qty,
        status = CASE WHEN remaining_qty - v_consume_qty <= 0 THEN 'depleted' ELSE 'active' END,
        updated_at = NOW()
    WHERE id = v_batch.id;

    -- Record transaction
    INSERT INTO inventory_transactions (
      txn_type, product_id, warehouse_id, batch_id,
      quantity_change, unit_cost_twd, total_cost_twd,
      reference_doc_type, reference_doc_id, created_by
    ) VALUES (
      'sd_out', p_product_id, p_warehouse_id, v_batch.id,
      -v_consume_qty, v_batch.unit_cost_twd, -v_cost,
      'sd_item', p_sd_item_id, p_created_by
    );

    v_total_cogs := v_total_cogs + v_cost;
    v_remaining  := v_remaining - v_consume_qty;

    v_consumed := v_consumed || jsonb_build_object(
      'batch_id',   v_batch.id,
      'quantity',   v_consume_qty,
      'unit_cost',  v_batch.unit_cost_twd,
      'total_cost', v_cost
    );
  END LOOP;

  -- Handle backorder if stock insufficient
  IF v_remaining > 0 THEN
    v_backorder_qty := v_remaining;

    -- Get estimated cost from latest active batch (or 0 if no batches)
    SELECT COALESCE(unit_cost_twd, 0) INTO v_estimated_cost
    FROM stock_batches
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id
    ORDER BY received_date DESC, id DESC
    LIMIT 1;

    -- Add estimated COGS for backorder quantity
    v_total_cogs := v_total_cogs + (v_remaining * v_estimated_cost);

    -- Create backorder record
    INSERT INTO backorders (sd_item_id, product_id, warehouse_id, quantity, estimated_cost_twd, status)
    VALUES (p_sd_item_id, p_product_id, p_warehouse_id, v_remaining, v_estimated_cost, 'pending');
  END IF;

  -- Update sd_item with COGS and batch consumption
  UPDATE sales_delivery_items
  SET cogs_twd          = v_total_cogs,
      batch_consumption = v_consumed,
      updated_at        = NOW()
  WHERE id = p_sd_item_id;

  RETURN jsonb_build_object(
    'consumed',        v_consumed,
    'backorder_qty',   v_backorder_qty,
    'total_cogs',      v_total_cogs,
    'estimated_cost',  v_estimated_cost
  );
END;
$$;

-- ============================================================
-- Trigger: GR completed → create batch + settle backorders
-- ============================================================

CREATE OR REPLACE FUNCTION trg_gr_create_batch_and_settle_backorders()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item      RECORD;
  v_batch_id  BIGINT;
  v_bo        RECORD;
  v_settle_qty  NUMERIC;
  v_bo_cost     NUMERIC;
  v_actual_cost NUMERIC;
  v_variance    NUMERIC;
  v_new_remaining NUMERIC;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    -- For each GR item, create a stock batch and log gr_in transaction
    FOR v_item IN
      SELECT gri.*, p.sku
      FROM goods_receipt_items gri
      JOIN products p ON p.id = gri.product_id
      WHERE gri.gr_id = NEW.id
    LOOP
      -- Use landed_unit_cost_twd if available, else unit_price_twd
      INSERT INTO stock_batches (
        product_id, warehouse_id, gr_item_id,
        received_date, quantity, remaining_qty,
        unit_cost_twd, status, source_type, source_id
      ) VALUES (
        v_item.product_id, NEW.warehouse_id, v_item.id,
        NEW.received_date, v_item.quantity, v_item.quantity,
        COALESCE(v_item.landed_unit_cost_twd, v_item.unit_price_twd),
        'active', 'gr', NEW.id
      ) RETURNING id INTO v_batch_id;

      -- Log gr_in transaction
      INSERT INTO inventory_transactions (
        txn_type, product_id, warehouse_id, batch_id,
        quantity_change, unit_cost_twd, total_cost_twd,
        reference_doc_type, reference_doc_id
      ) VALUES (
        'gr_in', v_item.product_id, NEW.warehouse_id, v_batch_id,
        v_item.quantity,
        COALESCE(v_item.landed_unit_cost_twd, v_item.unit_price_twd),
        v_item.quantity * COALESCE(v_item.landed_unit_cost_twd, v_item.unit_price_twd),
        'gr', NEW.id
      );

      -- Settle pending backorders for this product + warehouse (FIFO)
      v_new_remaining := v_item.quantity;

      FOR v_bo IN
        SELECT * FROM backorders
        WHERE product_id = v_item.product_id
          AND warehouse_id = NEW.warehouse_id
          AND status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_new_remaining <= 0;

        v_settle_qty  := LEAST(v_bo.quantity, v_new_remaining);
        v_bo_cost     := v_settle_qty * v_bo.estimated_cost_twd;
        v_actual_cost := v_settle_qty * COALESCE(v_item.landed_unit_cost_twd, v_item.unit_price_twd);
        v_variance    := v_actual_cost - v_bo_cost;

        -- Deduct from new batch
        UPDATE stock_batches
        SET remaining_qty = remaining_qty - v_settle_qty,
            status = CASE WHEN remaining_qty - v_settle_qty <= 0 THEN 'depleted' ELSE 'active' END,
            updated_at = NOW()
        WHERE id = v_batch_id;

        -- Mark backorder settled
        UPDATE backorders
        SET status = 'settled', settled_gr_id = NEW.id, settled_at = NOW()
        WHERE id = v_bo.id;

        -- Record COGS adjustment
        INSERT INTO sales_cogs_adjustments (sd_item_id, backorder_id, batch_id, quantity, estimated_cost, actual_cost, variance)
        VALUES (v_bo.sd_item_id, v_bo.id, v_batch_id, v_settle_qty, v_bo_cost, v_actual_cost, v_variance);

        -- Update sd_item cogs_twd
        UPDATE sales_delivery_items
        SET cogs_twd = cogs_twd + v_variance,
            updated_at = NOW()
        WHERE id = v_bo.sd_item_id;

        -- Log backorder_settle transaction
        INSERT INTO inventory_transactions (
          txn_type, product_id, warehouse_id, batch_id,
          quantity_change, unit_cost_twd, total_cost_twd,
          reference_doc_type, reference_doc_id
        ) VALUES (
          'backorder_settle', v_item.product_id, NEW.warehouse_id, v_batch_id,
          -v_settle_qty,
          COALESCE(v_item.landed_unit_cost_twd, v_item.unit_price_twd),
          -v_actual_cost,
          'backorder', v_bo.id
        );

        v_new_remaining := v_new_remaining - v_settle_qty;
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gr_create_batch_settle_backorders
  AFTER UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_gr_create_batch_and_settle_backorders();

-- ============================================================
-- Trigger: SD completed → trigger FIFO consumption
-- ============================================================

CREATE OR REPLACE FUNCTION trg_sd_fifo_consume()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item     RECORD;
  v_result   JSONB;
  v_total_cogs NUMERIC := 0;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    FOR v_item IN
      SELECT * FROM sales_delivery_items WHERE sd_id = NEW.id
    LOOP
      v_result := consume_inventory_fifo(
        v_item.product_id,
        v_item.warehouse_id,
        v_item.quantity,
        v_item.id,
        NEW.completed_by
      );
      v_total_cogs := v_total_cogs + (v_result->>'total_cogs')::NUMERIC;
    END LOOP;

    -- Update SD total cogs
    UPDATE sales_deliveries SET total_cogs_twd = v_total_cogs WHERE id = NEW.id;

    -- Update SO total cogs
    UPDATE sales_orders
    SET total_cogs_twd = (
      SELECT COALESCE(SUM(sdi.cogs_twd), 0)
      FROM sales_delivery_items sdi
      JOIN sales_deliveries sd ON sd.id = sdi.sd_id
      WHERE sd.so_id = NEW.so_id AND sd.status = 'completed'
    )
    WHERE id = NEW.so_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the Phase 2B stub trigger with full FIFO trigger
DROP TRIGGER IF EXISTS trg_sd_complete ON sales_deliveries;

CREATE TRIGGER trg_sd_complete
  AFTER UPDATE ON sales_deliveries
  FOR EACH ROW EXECUTE FUNCTION trg_sd_complete();

CREATE TRIGGER trg_sd_fifo_consume
  AFTER UPDATE ON sales_deliveries
  FOR EACH ROW EXECUTE FUNCTION trg_sd_fifo_consume();

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_stock_batches_updated_at
  BEFORE UPDATE ON stock_batches
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_inventory_transfers_updated_at
  BEFORE UPDATE ON inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- Views
-- ============================================================

CREATE VIEW v_stock_by_warehouse AS
SELECT
  p.id   AS product_id,
  p.sku,
  p.name AS product_name,
  w.id   AS warehouse_id,
  w.code AS warehouse_code,
  w.name AS warehouse_name,
  COALESCE(SUM(sb.remaining_qty), 0)                       AS stock_qty,
  COALESCE(SUM(sb.remaining_qty * sb.unit_cost_twd), 0)    AS stock_value_twd,
  CASE WHEN SUM(sb.remaining_qty) > 0
       THEN SUM(sb.remaining_qty * sb.unit_cost_twd) / SUM(sb.remaining_qty)
       ELSE NULL END                                         AS avg_unit_cost_twd,
  COUNT(sb.id) FILTER (WHERE sb.status = 'active')         AS active_batch_count
FROM products p
CROSS JOIN warehouses w
LEFT JOIN stock_batches sb ON sb.product_id = p.id
  AND sb.warehouse_id = w.id AND sb.status = 'active'
WHERE p.deleted_at IS NULL AND w.status = 'active'
GROUP BY p.id, p.sku, p.name, w.id, w.code, w.name;

CREATE VIEW v_stock_overview AS
SELECT
  p.id   AS product_id,
  p.sku,
  p.name AS product_name,
  p.min_stock_qty,
  p.reorder_point,
  COALESCE(SUM(sb.remaining_qty), 0)                       AS total_stock_qty,
  COALESCE(SUM(sb.remaining_qty * sb.unit_cost_twd), 0)    AS total_stock_value_twd,
  COUNT(DISTINCT sb.warehouse_id)                          AS warehouse_count
FROM products p
LEFT JOIN stock_batches sb ON sb.product_id = p.id AND sb.status = 'active'
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.sku, p.name, p.min_stock_qty, p.reorder_point;

CREATE VIEW v_low_stock_alerts AS
SELECT
  p.id AS product_id, p.sku, p.name AS product_name,
  p.min_stock_qty, p.reorder_point,
  w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
  COALESCE(SUM(sb.remaining_qty), 0) AS current_stock,
  p.reorder_point - COALESCE(SUM(sb.remaining_qty), 0) AS shortage
FROM products p
CROSS JOIN warehouses w
LEFT JOIN stock_batches sb ON sb.product_id = p.id
  AND sb.warehouse_id = w.id AND sb.status = 'active'
WHERE p.deleted_at IS NULL AND w.status = 'active'
  AND p.reorder_point > 0
GROUP BY p.id, p.sku, p.name, p.min_stock_qty, p.reorder_point, w.id, w.code, w.name
HAVING COALESCE(SUM(sb.remaining_qty), 0) < p.reorder_point;

CREATE VIEW v_aging_analysis AS
SELECT
  p.id   AS product_id,
  p.sku,
  p.name AS product_name,
  w.id   AS warehouse_id,
  w.code AS warehouse_code,
  sb.id  AS batch_id,
  sb.received_date,
  sb.remaining_qty,
  sb.unit_cost_twd,
  sb.remaining_qty * sb.unit_cost_twd AS batch_value_twd,
  CURRENT_DATE - sb.received_date     AS days_in_stock,
  CASE
    WHEN CURRENT_DATE - sb.received_date < 30   THEN '0-30天'
    WHEN CURRENT_DATE - sb.received_date < 90   THEN '31-90天'
    WHEN CURRENT_DATE - sb.received_date < 180  THEN '91-180天'
    WHEN CURRENT_DATE - sb.received_date < 365  THEN '181-365天'
    ELSE '超過1年'
  END AS age_bucket
FROM stock_batches sb
JOIN products p ON p.id = sb.product_id
JOIN warehouses w ON w.id = sb.warehouse_id
WHERE sb.status = 'active' AND sb.remaining_qty > 0
ORDER BY sb.received_date ASC;

COMMIT;
