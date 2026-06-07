-- Phase 4: Reporting system with monthly snapshots

BEGIN;

-- ============================================================
-- Accounting periods (2026-01 ~ 2027-12 pre-created)
-- ============================================================

CREATE TABLE accounting_periods (
  id              BIGSERIAL PRIMARY KEY,
  period_code     VARCHAR(7) NOT NULL UNIQUE,  -- 'YYYY-MM'
  year            SMALLINT NOT NULL,
  month           SMALLINT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_closed       BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_monthly_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  period_code         VARCHAR(7) NOT NULL,
  product_id          BIGINT NOT NULL REFERENCES products(id),
  warehouse_id        BIGINT NOT NULL REFERENCES warehouses(id),
  opening_qty         NUMERIC(14,4) NOT NULL DEFAULT 0,
  opening_value_twd   NUMERIC(16,4) NOT NULL DEFAULT 0,
  in_qty              NUMERIC(14,4) NOT NULL DEFAULT 0,
  in_value_twd        NUMERIC(16,4) NOT NULL DEFAULT 0,
  out_qty             NUMERIC(14,4) NOT NULL DEFAULT 0,
  out_value_twd       NUMERIC(16,4) NOT NULL DEFAULT 0,
  adjust_qty          NUMERIC(14,4) NOT NULL DEFAULT 0,
  adjust_value_twd    NUMERIC(16,4) NOT NULL DEFAULT 0,
  closing_qty         NUMERIC(14,4) NOT NULL DEFAULT 0,
  closing_value_twd   NUMERIC(16,4) NOT NULL DEFAULT 0,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period_code, product_id, warehouse_id)
);

CREATE INDEX idx_ims_period ON inventory_monthly_snapshots(period_code);
CREATE INDEX idx_ims_product ON inventory_monthly_snapshots(product_id);

-- Pre-create 2026-01 to 2027-12 periods
INSERT INTO accounting_periods (period_code, year, month, start_date, end_date)
SELECT
  TO_CHAR(d, 'YYYY-MM'),
  EXTRACT(YEAR FROM d)::SMALLINT,
  EXTRACT(MONTH FROM d)::SMALLINT,
  DATE_TRUNC('month', d)::DATE,
  (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::DATE
FROM generate_series('2026-01-01'::DATE, '2027-12-01'::DATE, '1 month'::INTERVAL) d;

-- ============================================================
-- Monthly snapshot generator
-- ============================================================

CREATE OR REPLACE FUNCTION generate_monthly_inventory_snapshot(p_period_code VARCHAR)
RETURNS TABLE (
  product_id    BIGINT,
  warehouse_id  BIGINT,
  closing_qty   NUMERIC,
  closing_value NUMERIC
) LANGUAGE plpgsql AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
BEGIN
  SELECT start_date, end_date INTO v_start, v_end
  FROM accounting_periods WHERE period_code = p_period_code;

  -- Delete existing snapshot for this period
  DELETE FROM inventory_monthly_snapshots WHERE period_code = p_period_code;

  -- Insert new snapshot data from transactions
  INSERT INTO inventory_monthly_snapshots (
    period_code, product_id, warehouse_id,
    opening_qty, opening_value_twd,
    in_qty, in_value_twd,
    out_qty, out_value_twd,
    adjust_qty, adjust_value_twd,
    closing_qty, closing_value_twd
  )
  SELECT
    p_period_code,
    it.product_id,
    it.warehouse_id,
    -- Opening = transactions before period start
    COALESCE(SUM(CASE WHEN it.txn_date < v_start THEN it.quantity_change ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN it.txn_date < v_start THEN ABS(COALESCE(it.total_cost_twd, 0)) * SIGN(it.quantity_change) ELSE 0 END), 0),
    -- In: positive movements in period
    COALESCE(SUM(CASE WHEN it.txn_date BETWEEN v_start AND v_end + 1 AND it.quantity_change > 0 THEN it.quantity_change ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN it.txn_date BETWEEN v_start AND v_end + 1 AND it.quantity_change > 0 THEN ABS(COALESCE(it.total_cost_twd, 0)) ELSE 0 END), 0),
    -- Out: negative movements in period
    COALESCE(ABS(SUM(CASE WHEN it.txn_date BETWEEN v_start AND v_end + 1 AND it.quantity_change < 0 THEN it.quantity_change ELSE 0 END)), 0),
    COALESCE(ABS(SUM(CASE WHEN it.txn_date BETWEEN v_start AND v_end + 1 AND it.quantity_change < 0 THEN COALESCE(it.total_cost_twd, 0) ELSE 0 END)), 0),
    0, 0,  -- adjust (for manual adjustments, Phase 5)
    -- Closing = all transactions up to period end
    COALESCE(SUM(CASE WHEN it.txn_date <= v_end + 1 THEN it.quantity_change ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN it.txn_date <= v_end + 1 THEN COALESCE(it.total_cost_twd, 0) ELSE 0 END), 0)
  FROM inventory_transactions it
  GROUP BY it.product_id, it.warehouse_id;

  RETURN QUERY
  SELECT ims.product_id, ims.warehouse_id, ims.closing_qty, ims.closing_value_twd
  FROM inventory_monthly_snapshots ims
  WHERE ims.period_code = p_period_code;
END;
$$;

-- ============================================================
-- Report functions
-- ============================================================

-- Gross profit report
CREATE OR REPLACE FUNCTION report_gross_profit(p_start DATE, p_end DATE)
RETURNS TABLE (
  metric      TEXT,
  amount_twd  NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH sales AS (
    SELECT
      COALESCE(SUM(sdi.subtotal_twd), 0) AS gross_revenue,
      COALESCE(SUM(sdi.cogs_twd), 0)     AS total_cogs
    FROM sales_delivery_items sdi
    JOIN sales_deliveries sd ON sd.id = sdi.sd_id
    WHERE sd.status = 'completed' AND sd.delivery_date BETWEEN p_start AND p_end
  ),
  returns AS (
    SELECT COALESCE(SUM(sri.subtotal_twd), 0) AS total_returns
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.return_id
    WHERE sr.status = 'completed' AND sr.return_date BETWEEN p_start AND p_end
  ),
  forex AS (
    SELECT COALESCE(SUM(apa.forex_gain_loss), 0) AS total_forex
    FROM ap_payment_allocations apa
    JOIN ap_payments pay ON pay.id = apa.payment_id
    WHERE pay.status = 'completed' AND pay.payment_date BETWEEN p_start AND p_end
  )
  SELECT '營業收入'::TEXT,         s.gross_revenue FROM sales s
  UNION ALL
  SELECT '銷退折讓'::TEXT,         -r.total_returns FROM returns r
  UNION ALL
  SELECT '淨收入'::TEXT,           s.gross_revenue - r.total_returns FROM sales s, returns r
  UNION ALL
  SELECT '銷貨成本(COGS)'::TEXT,   -s.total_cogs FROM sales s
  UNION ALL
  SELECT '毛利'::TEXT,             s.gross_revenue - r.total_returns - s.total_cogs FROM sales s, returns r
  UNION ALL
  SELECT '外匯損益'::TEXT,         f.total_forex FROM forex f
  UNION ALL
  SELECT '稅前淨利'::TEXT,         s.gross_revenue - r.total_returns - s.total_cogs + f.total_forex FROM sales s, returns r, forex f;
END;
$$;

-- Customer statement
CREATE OR REPLACE FUNCTION report_customer_statement(p_customer_id BIGINT, p_period VARCHAR DEFAULT NULL)
RETURNS TABLE (
  doc_date    DATE,
  doc_type    TEXT,
  doc_number  TEXT,
  amount_twd  NUMERIC,
  balance_twd NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.invoice_date,
    'AR 發票'::TEXT,
    ar.invoice_number::TEXT,
    ar.amount_twd,
    ar.amount_remaining
  FROM ar_invoices ar
  WHERE ar.customer_id = p_customer_id
    AND (p_period IS NULL OR TO_CHAR(ar.invoice_date, 'YYYY-MM') = p_period)
  ORDER BY ar.invoice_date;
END;
$$;

-- Product analysis
CREATE OR REPLACE FUNCTION report_product_analysis(p_start DATE, p_end DATE)
RETURNS TABLE (
  product_id    BIGINT,
  sku           TEXT,
  product_name  TEXT,
  qty_sold      NUMERIC,
  revenue_twd   NUMERIC,
  cogs_twd      NUMERIC,
  gross_profit  NUMERIC,
  margin_rate   NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.sku::TEXT,
    p.name::TEXT,
    COALESCE(SUM(sdi.quantity), 0),
    COALESCE(SUM(sdi.subtotal_twd), 0),
    COALESCE(SUM(sdi.cogs_twd), 0),
    COALESCE(SUM(sdi.subtotal_twd) - SUM(sdi.cogs_twd), 0),
    CASE WHEN SUM(sdi.subtotal_twd) > 0
         THEN ROUND((SUM(sdi.subtotal_twd) - SUM(sdi.cogs_twd)) / SUM(sdi.subtotal_twd) * 100, 2)
         ELSE 0 END
  FROM products p
  LEFT JOIN sales_delivery_items sdi ON sdi.product_id = p.id
  LEFT JOIN sales_deliveries sd ON sd.id = sdi.sd_id
    AND sd.status = 'completed' AND sd.delivery_date BETWEEN p_start AND p_end
  WHERE p.deleted_at IS NULL
  GROUP BY p.id, p.sku, p.name
  ORDER BY COALESCE(SUM(sdi.subtotal_twd), 0) DESC;
END;
$$;

-- Import shipment P&L
CREATE OR REPLACE FUNCTION report_import_shipment_pnl(p_gr_id BIGINT)
RETURNS TABLE (
  product_name     TEXT,
  qty_received     NUMERIC,
  qty_sold         NUMERIC,
  qty_remaining    NUMERIC,
  landed_unit_cost NUMERIC,
  avg_selling_price NUMERIC,
  realized_pnl     NUMERIC,
  unrealized_value NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.name::TEXT,
    gri.quantity,
    COALESCE(SUM(sdi.quantity), 0),
    gri.quantity - COALESCE(SUM(sdi.quantity), 0),
    COALESCE(gri.landed_unit_cost_twd, gri.unit_price_twd),
    CASE WHEN SUM(sdi.quantity) > 0
         THEN SUM(sdi.subtotal_twd) / SUM(sdi.quantity)
         ELSE 0 END,
    COALESCE(SUM(sdi.subtotal_twd - sdi.cogs_twd), 0),
    (gri.quantity - COALESCE(SUM(sdi.quantity), 0))
      * COALESCE(gri.landed_unit_cost_twd, gri.unit_price_twd)
  FROM goods_receipt_items gri
  JOIN products p ON p.id = gri.product_id
  LEFT JOIN inventory_transactions it ON it.batch_id IN (
    SELECT id FROM stock_batches WHERE gr_item_id = gri.id
  ) AND it.txn_type = 'sd_out'
  LEFT JOIN sales_delivery_items sdi ON sdi.id = it.reference_doc_id
    AND it.reference_doc_type = 'sd_item'
  WHERE gri.gr_id = p_gr_id
  GROUP BY p.name, gri.quantity, gri.landed_unit_cost_twd, gri.unit_price_twd;
END;
$$;

-- ============================================================
-- Views
-- ============================================================

CREATE VIEW v_stock_inout_balance AS
SELECT
  TO_CHAR(it.txn_date, 'YYYY-MM') AS period_code,
  p.id AS product_id, p.sku, p.name AS product_name,
  w.id AS warehouse_id, w.code AS warehouse_code,
  SUM(CASE WHEN it.quantity_change > 0 THEN it.quantity_change ELSE 0 END) AS in_qty,
  SUM(CASE WHEN it.quantity_change < 0 THEN ABS(it.quantity_change) ELSE 0 END) AS out_qty,
  SUM(it.quantity_change) AS net_change,
  SUM(CASE WHEN it.quantity_change > 0 THEN ABS(COALESCE(it.total_cost_twd,0)) ELSE 0 END) AS in_value_twd,
  SUM(CASE WHEN it.quantity_change < 0 THEN ABS(COALESCE(it.total_cost_twd,0)) ELSE 0 END) AS out_value_twd
FROM inventory_transactions it
JOIN products p ON p.id = it.product_id
JOIN warehouses w ON w.id = it.warehouse_id
GROUP BY TO_CHAR(it.txn_date, 'YYYY-MM'), p.id, p.sku, p.name, w.id, w.code;

CREATE VIEW v_customer_profitability AS
SELECT
  c.id AS customer_id, c.name AS customer_name, c.tier,
  COUNT(DISTINCT so.id)              AS order_count,
  COALESCE(SUM(sdi.subtotal_twd), 0)    AS revenue_twd,
  COALESCE(SUM(sdi.cogs_twd), 0)        AS cogs_twd,
  COALESCE(SUM(sdi.subtotal_twd - sdi.cogs_twd), 0) AS gross_profit_twd,
  CASE WHEN SUM(sdi.subtotal_twd) > 0
       THEN ROUND((SUM(sdi.subtotal_twd) - SUM(sdi.cogs_twd)) / SUM(sdi.subtotal_twd) * 100, 2)
       ELSE 0 END AS margin_rate
FROM customers c
LEFT JOIN sales_orders so ON so.customer_id = c.id AND so.status = 'completed'
LEFT JOIN sales_delivery_items sdi ON sdi.sd_id IN (
  SELECT id FROM sales_deliveries WHERE so_id = so.id AND status = 'completed'
)
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.tier;

CREATE VIEW v_monthly_sales_trend AS
SELECT
  TO_CHAR(sd.delivery_date, 'YYYY-MM') AS period_code,
  COUNT(DISTINCT sd.id) AS delivery_count,
  COUNT(DISTINCT sd.so_id) AS order_count,
  COALESCE(SUM(sdi.subtotal_twd), 0)  AS revenue_twd,
  COALESCE(SUM(sdi.cogs_twd), 0)      AS cogs_twd,
  COALESCE(SUM(sdi.subtotal_twd - sdi.cogs_twd), 0) AS gross_profit_twd
FROM sales_deliveries sd
JOIN sales_delivery_items sdi ON sdi.sd_id = sd.id
WHERE sd.status = 'completed'
GROUP BY TO_CHAR(sd.delivery_date, 'YYYY-MM')
ORDER BY 1;

CREATE VIEW v_inventory_valuation AS
SELECT
  p.id AS product_id, p.sku, p.name AS product_name,
  w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name,
  COALESCE(SUM(sb.remaining_qty), 0) AS qty,
  COALESCE(SUM(sb.remaining_qty * sb.unit_cost_twd), 0) AS value_twd,
  CASE WHEN SUM(sb.remaining_qty) > 0
       THEN SUM(sb.remaining_qty * sb.unit_cost_twd) / SUM(sb.remaining_qty)
       ELSE 0 END AS avg_unit_cost
FROM products p
CROSS JOIN warehouses w
LEFT JOIN stock_batches sb ON sb.product_id = p.id AND sb.warehouse_id = w.id AND sb.status = 'active'
WHERE p.deleted_at IS NULL AND w.status = 'active'
GROUP BY p.id, p.sku, p.name, w.id, w.code, w.name;

COMMIT;
