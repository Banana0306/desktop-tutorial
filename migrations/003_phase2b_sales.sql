-- Phase 2B: Sales module
-- SO, SD (multi-warehouse), SR with FIFO stub

BEGIN;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE so_status AS ENUM ('draft', 'confirmed', 'delivering', 'completed', 'cancelled');
CREATE TYPE sd_status AS ENUM ('draft', 'completed', 'cancelled');
CREATE TYPE sr_status AS ENUM ('draft', 'completed', 'cancelled');

-- ============================================================
-- Sales Orders
-- ============================================================

CREATE TABLE sales_orders (
  id                  BIGSERIAL PRIMARY KEY,
  so_number           VARCHAR(30) NOT NULL UNIQUE,
  customer_id         BIGINT NOT NULL REFERENCES customers(id),
  status              so_status NOT NULL DEFAULT 'draft',
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  total_amount_orig   NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_amount_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  total_cogs_twd      NUMERIC(16,4) NOT NULL DEFAULT 0,
  expected_delivery   DATE,
  notes               TEXT,
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        BIGINT REFERENCES users(id),
  cancelled_at        TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales_order_items (
  id                  BIGSERIAL PRIMARY KEY,
  so_id               BIGINT NOT NULL REFERENCES sales_orders(id),
  product_id          BIGINT NOT NULL REFERENCES products(id),
  product_snapshot    JSONB,
  quantity            NUMERIC(14,4) NOT NULL,
  unit_price_orig     NUMERIC(14,4) NOT NULL,
  unit_price_twd      NUMERIC(14,4) NOT NULL,
  price_source        VARCHAR(20) NOT NULL DEFAULT 'list',
  subtotal_orig       NUMERIC(16,4) NOT NULL,
  subtotal_twd        NUMERIC(16,4) NOT NULL,
  delivered_quantity  NUMERIC(14,4) NOT NULL DEFAULT 0,
  returned_quantity   NUMERIC(14,4) NOT NULL DEFAULT 0,
  cogs_twd            NUMERIC(16,4) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Sales Deliveries (warehouse_id on ITEM level for multi-warehouse)
-- ============================================================

CREATE TABLE sales_deliveries (
  id                  BIGSERIAL PRIMARY KEY,
  sd_number           VARCHAR(30) NOT NULL UNIQUE,
  so_id               BIGINT NOT NULL REFERENCES sales_orders(id),
  customer_id         BIGINT NOT NULL REFERENCES customers(id),
  status              sd_status NOT NULL DEFAULT 'draft',
  delivery_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  total_cogs_twd      NUMERIC(16,4) NOT NULL DEFAULT 0,
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  completed_by        BIGINT REFERENCES users(id),
  cancelled_at        TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales_delivery_items (
  id                      BIGSERIAL PRIMARY KEY,
  sd_id                   BIGINT NOT NULL REFERENCES sales_deliveries(id),
  so_item_id              BIGINT NOT NULL REFERENCES sales_order_items(id),
  product_id              BIGINT NOT NULL REFERENCES products(id),
  product_snapshot        JSONB,
  warehouse_id            BIGINT NOT NULL REFERENCES warehouses(id),
  quantity                NUMERIC(14,4) NOT NULL,
  unit_price_twd          NUMERIC(14,4) NOT NULL,
  subtotal_twd            NUMERIC(16,4) NOT NULL,
  cogs_twd                NUMERIC(16,4) NOT NULL DEFAULT 0,
  batch_consumption       JSONB,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Sales Returns
-- ============================================================

CREATE TABLE sales_returns (
  id                  BIGSERIAL PRIMARY KEY,
  return_number       VARCHAR(30) NOT NULL UNIQUE,
  sd_id               BIGINT NOT NULL REFERENCES sales_deliveries(id),
  so_id               BIGINT NOT NULL REFERENCES sales_orders(id),
  customer_id         BIGINT NOT NULL REFERENCES customers(id),
  status              sr_status NOT NULL DEFAULT 'draft',
  return_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  reason              TEXT,
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales_return_items (
  id                  BIGSERIAL PRIMARY KEY,
  return_id           BIGINT NOT NULL REFERENCES sales_returns(id),
  sd_item_id          BIGINT NOT NULL REFERENCES sales_delivery_items(id),
  product_id          BIGINT NOT NULL REFERENCES products(id),
  warehouse_id        BIGINT REFERENCES warehouses(id),
  quantity            NUMERIC(14,4) NOT NULL,
  unit_price_twd      NUMERIC(14,4) NOT NULL,
  subtotal_twd        NUMERIC(16,4) NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_so_customer ON sales_orders(customer_id);
CREATE INDEX idx_so_status ON sales_orders(status);
CREATE INDEX idx_so_number ON sales_orders(so_number);
CREATE INDEX idx_so_created ON sales_orders(created_at DESC);

CREATE INDEX idx_soi_so ON sales_order_items(so_id);
CREATE INDEX idx_soi_product ON sales_order_items(product_id);

CREATE INDEX idx_sd_so ON sales_deliveries(so_id);
CREATE INDEX idx_sd_status ON sales_deliveries(status);
CREATE INDEX idx_sd_number ON sales_deliveries(sd_number);

CREATE INDEX idx_sdi_sd ON sales_delivery_items(sd_id);
CREATE INDEX idx_sdi_product ON sales_delivery_items(product_id);
CREATE INDEX idx_sdi_warehouse ON sales_delivery_items(warehouse_id);

CREATE INDEX idx_sr_sd ON sales_returns(sd_id);
CREATE INDEX idx_sri_return ON sales_return_items(return_id);

-- ============================================================
-- Trigger: SD complete → update SO delivered qty + status (FIFO stub)
-- Full FIFO implementation in Phase 2C
-- ============================================================

CREATE OR REPLACE FUNCTION trg_sd_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_so_id      BIGINT;
  v_total_qty  NUMERIC;
  v_deliv_qty  NUMERIC;
  v_new_status so_status;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    v_so_id := NEW.so_id;

    -- Update delivered_quantity on each SO item
    UPDATE sales_order_items soi
    SET delivered_quantity = (
      SELECT COALESCE(SUM(sdi.quantity), 0)
      FROM sales_delivery_items sdi
      JOIN sales_deliveries sd ON sd.id = sdi.sd_id
      WHERE sdi.so_item_id = soi.id AND sd.status = 'completed'
    )
    WHERE soi.so_id = v_so_id;

    -- Determine SO status
    SELECT SUM(quantity), SUM(delivered_quantity)
    INTO v_total_qty, v_deliv_qty
    FROM sales_order_items
    WHERE so_id = v_so_id;

    IF v_deliv_qty >= v_total_qty THEN
      v_new_status := 'completed';
    ELSE
      v_new_status := 'delivering';
    END IF;

    UPDATE sales_orders SET status = v_new_status WHERE id = v_so_id AND status NOT IN ('cancelled');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sd_complete
  AFTER UPDATE ON sales_deliveries
  FOR EACH ROW EXECUTE FUNCTION trg_sd_complete();

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_sales_orders_updated_at
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_sales_order_items_updated_at
  BEFORE UPDATE ON sales_order_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_sales_deliveries_updated_at
  BEFORE UPDATE ON sales_deliveries
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_sales_delivery_items_updated_at
  BEFORE UPDATE ON sales_delivery_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_sales_returns_updated_at
  BEFORE UPDATE ON sales_returns
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_sales_return_items_updated_at
  BEFORE UPDATE ON sales_return_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
