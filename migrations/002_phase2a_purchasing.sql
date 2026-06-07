-- Phase 2A: Purchasing module
-- PO, GR, Purchase Returns with multi-currency support

BEGIN;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE po_status AS ENUM ('draft', 'confirmed', 'receiving', 'completed', 'cancelled');
CREATE TYPE gr_status AS ENUM ('draft', 'completed', 'cancelled');
CREATE TYPE return_status AS ENUM ('draft', 'confirmed', 'completed', 'cancelled');

-- ============================================================
-- Generic document number generator
-- Usage: generate_doc_number('purchase_orders', 'po_number', 'PO')
--        → 'PO-202606-0001'
-- ============================================================

CREATE OR REPLACE FUNCTION generate_doc_number(
  p_table  TEXT,
  p_column TEXT,
  p_prefix TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_ym    TEXT;
  v_seq   INT;
  v_sql   TEXT;
BEGIN
  v_ym  := TO_CHAR(NOW(), 'YYYYMM');
  v_sql := format(
    'SELECT COUNT(*) + 1 FROM %I WHERE %I LIKE $1',
    p_table, p_column
  );
  EXECUTE v_sql INTO v_seq USING p_prefix || '-' || v_ym || '-%';
  RETURN p_prefix || '-' || v_ym || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- ============================================================
-- Purchase Orders
-- ============================================================

CREATE TABLE purchase_orders (
  id                  BIGSERIAL PRIMARY KEY,
  po_number           VARCHAR(30) NOT NULL UNIQUE,
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  status              po_status NOT NULL DEFAULT 'draft',
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  total_amount_orig   NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_amount_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  expected_delivery   DATE,
  warehouse_id        BIGINT REFERENCES warehouses(id),
  notes               TEXT,
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        BIGINT REFERENCES users(id),
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        BIGINT REFERENCES users(id),
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id                      BIGSERIAL PRIMARY KEY,
  po_id                   BIGINT NOT NULL REFERENCES purchase_orders(id),
  product_id              BIGINT NOT NULL REFERENCES products(id),
  product_snapshot        JSONB,
  quantity                NUMERIC(14,4) NOT NULL,
  unit_price_orig         NUMERIC(14,4) NOT NULL,
  unit_price_twd          NUMERIC(14,4) NOT NULL,
  subtotal_orig           NUMERIC(16,4) NOT NULL,
  subtotal_twd            NUMERIC(16,4) NOT NULL,
  received_quantity       NUMERIC(14,4) NOT NULL DEFAULT 0,
  returned_quantity       NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- Landed cost reservations (Phase 3 will fill these)
  customs_duty            NUMERIC(14,4),
  commodity_tax           NUMERIC(14,4),
  bsmi_fee                NUMERIC(14,4),
  inland_freight          NUMERIC(14,4),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Goods Receipts
-- ============================================================

CREATE TABLE goods_receipts (
  id                  BIGSERIAL PRIMARY KEY,
  gr_number           VARCHAR(30) NOT NULL UNIQUE,
  po_id               BIGINT NOT NULL REFERENCES purchase_orders(id),
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
  status              gr_status NOT NULL DEFAULT 'draft',
  received_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  total_amount_orig   NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_amount_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  -- Landed cost fields (Phase 3)
  customs_exchange_rate       NUMERIC(12,6),
  customs_declaration_date    DATE,
  landed_cost_status          VARCHAR(20) DEFAULT 'pending',
  allocation_method           VARCHAR(20) DEFAULT 'value',
  notes                       TEXT,
  completed_at                TIMESTAMPTZ,
  completed_by                BIGINT REFERENCES users(id),
  cancelled_at                TIMESTAMPTZ,
  created_by                  BIGINT REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goods_receipt_items (
  id                  BIGSERIAL PRIMARY KEY,
  gr_id               BIGINT NOT NULL REFERENCES goods_receipts(id),
  po_item_id          BIGINT NOT NULL REFERENCES purchase_order_items(id),
  product_id          BIGINT NOT NULL REFERENCES products(id),
  product_snapshot    JSONB,
  quantity            NUMERIC(14,4) NOT NULL,
  unit_price_orig     NUMERIC(14,4) NOT NULL,
  unit_price_twd      NUMERIC(14,4) NOT NULL,
  subtotal_orig       NUMERIC(16,4) NOT NULL,
  subtotal_twd        NUMERIC(16,4) NOT NULL,
  -- Landed cost per item (Phase 3 fills these)
  allocated_customs_duty      NUMERIC(14,4),
  allocated_commodity_tax     NUMERIC(14,4),
  allocated_bsmi_fee          NUMERIC(14,4),
  allocated_inland_freight    NUMERIC(14,4),
  allocated_other_cost        NUMERIC(14,4),
  landed_unit_cost_twd        NUMERIC(14,4),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Purchase Returns
-- ============================================================

CREATE TABLE purchase_returns (
  id                  BIGSERIAL PRIMARY KEY,
  return_number       VARCHAR(30) NOT NULL UNIQUE,
  gr_id               BIGINT NOT NULL REFERENCES goods_receipts(id),
  po_id               BIGINT NOT NULL REFERENCES purchase_orders(id),
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
  status              return_status NOT NULL DEFAULT 'draft',
  return_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  total_amount_orig   NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_amount_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  reason              TEXT,
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_return_items (
  id                  BIGSERIAL PRIMARY KEY,
  return_id           BIGINT NOT NULL REFERENCES purchase_returns(id),
  gr_item_id          BIGINT NOT NULL REFERENCES goods_receipt_items(id),
  product_id          BIGINT NOT NULL REFERENCES products(id),
  product_snapshot    JSONB,
  quantity            NUMERIC(14,4) NOT NULL,
  unit_price_orig     NUMERIC(14,4) NOT NULL,
  unit_price_twd      NUMERIC(14,4) NOT NULL,
  subtotal_orig       NUMERIC(16,4) NOT NULL,
  subtotal_twd        NUMERIC(16,4) NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_number ON purchase_orders(po_number);
CREATE INDEX idx_po_created_at ON purchase_orders(created_at DESC);

CREATE INDEX idx_poi_po ON purchase_order_items(po_id);
CREATE INDEX idx_poi_product ON purchase_order_items(product_id);

CREATE INDEX idx_gr_po ON goods_receipts(po_id);
CREATE INDEX idx_gr_supplier ON goods_receipts(supplier_id);
CREATE INDEX idx_gr_status ON goods_receipts(status);
CREATE INDEX idx_gr_number ON goods_receipts(gr_number);

CREATE INDEX idx_gri_gr ON goods_receipt_items(gr_id);
CREATE INDEX idx_gri_product ON goods_receipt_items(product_id);

CREATE INDEX idx_pr_gr ON purchase_returns(gr_id);
CREATE INDEX idx_pr_status ON purchase_returns(status);

CREATE INDEX idx_pri_return ON purchase_return_items(return_id);

-- ============================================================
-- Trigger: GR complete → update PO status + po_item received qty
-- ============================================================

CREATE OR REPLACE FUNCTION trg_gr_complete_update_po()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_id       BIGINT;
  v_total_qty   NUMERIC;
  v_recv_qty    NUMERIC;
  v_new_status  po_status;
BEGIN
  -- Only act when status changes to 'completed'
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    v_po_id := NEW.po_id;

    -- Update received_quantity on each PO item
    UPDATE purchase_order_items poi
    SET received_quantity = (
      SELECT COALESCE(SUM(gri.quantity), 0)
      FROM goods_receipt_items gri
      JOIN goods_receipts gr ON gr.id = gri.gr_id
      WHERE gri.po_item_id = poi.id AND gr.status = 'completed'
    )
    WHERE poi.po_id = v_po_id;

    -- Update returned_quantity on each PO item
    UPDATE purchase_order_items poi
    SET returned_quantity = (
      SELECT COALESCE(SUM(pri.quantity), 0)
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      WHERE pri.gr_item_id IN (
        SELECT id FROM goods_receipt_items WHERE po_item_id = poi.id
      ) AND pr.status = 'completed'
    )
    WHERE poi.po_id = v_po_id;

    -- Determine new PO status
    SELECT SUM(quantity), SUM(received_quantity)
    INTO v_total_qty, v_recv_qty
    FROM purchase_order_items
    WHERE po_id = v_po_id;

    IF v_recv_qty >= v_total_qty THEN
      v_new_status := 'completed';
    ELSE
      v_new_status := 'receiving';
    END IF;

    UPDATE purchase_orders SET status = v_new_status WHERE id = v_po_id AND status NOT IN ('cancelled');
  END IF;

  -- When a GR is cancelled, recalculate PO status
  IF NEW.status = 'cancelled' AND OLD.status = 'completed' THEN
    v_po_id := NEW.po_id;

    UPDATE purchase_order_items poi
    SET received_quantity = (
      SELECT COALESCE(SUM(gri.quantity), 0)
      FROM goods_receipt_items gri
      JOIN goods_receipts gr ON gr.id = gri.gr_id
      WHERE gri.po_item_id = poi.id AND gr.status = 'completed'
    )
    WHERE poi.po_id = v_po_id;

    SELECT SUM(quantity), SUM(received_quantity)
    INTO v_total_qty, v_recv_qty
    FROM purchase_order_items
    WHERE po_id = v_po_id;

    IF v_recv_qty = 0 THEN
      v_new_status := 'confirmed';
    ELSIF v_recv_qty >= v_total_qty THEN
      v_new_status := 'completed';
    ELSE
      v_new_status := 'receiving';
    END IF;

    UPDATE purchase_orders SET status = v_new_status WHERE id = v_po_id AND status NOT IN ('cancelled');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gr_complete_update_po
  AFTER UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_gr_complete_update_po();

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_purchase_order_items_updated_at
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_goods_receipts_updated_at
  BEFORE UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_goods_receipt_items_updated_at
  BEFORE UPDATE ON goods_receipt_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_purchase_returns_updated_at
  BEFORE UPDATE ON purchase_returns
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_purchase_return_items_updated_at
  BEFORE UPDATE ON purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
