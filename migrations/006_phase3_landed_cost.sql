-- Phase 3: Import landed cost allocation

BEGIN;

-- ============================================================
-- Extend products with logistics fields (already added some in Phase 1)
-- ============================================================

-- (weight_kg, volume_cbm, default_customs_duty_rate, default_commodity_tax_rate, requires_bsmi
--  were already added in Phase 1 migration)

-- ============================================================
-- ENUM
-- ============================================================

CREATE TYPE component_type AS ENUM (
  'customs_duty', 'commodity_tax', 'bsmi_fee',
  'inland_freight', 'port_handling', 'insurance',
  'agent_fee', 'other'
);

-- ============================================================
-- Extend goods_receipts with customs/landed cost fields
-- ============================================================

-- Some columns already added in Phase 2A; only add missing ones
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS air_freight_twd     NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS sea_freight_twd     NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS insurance_twd       NUMERIC(14,4);

-- ============================================================
-- New table: landed_cost_components
-- ============================================================

CREATE TABLE landed_cost_components (
  id              BIGSERIAL PRIMARY KEY,
  gr_id           BIGINT NOT NULL REFERENCES goods_receipts(id),
  component_type  component_type NOT NULL,
  amount_twd      NUMERIC(14,4) NOT NULL,
  apply_to_all    BOOLEAN NOT NULL DEFAULT TRUE,
  apply_product_ids BIGINT[],
  description     TEXT,
  created_by      BIGINT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lcc_gr ON landed_cost_components(gr_id);

CREATE TRIGGER trg_lcc_updated_at
  BEFORE UPDATE ON landed_cost_components
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- Function: calculate_taxes_for_gr_item
-- Calculates customs duty + commodity tax for one GR item
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_taxes_for_gr_item(
  p_gr_item_id BIGINT,
  p_customs_exchange_rate NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  customs_duty    NUMERIC,
  commodity_tax   NUMERIC,
  total_tax       NUMERIC
) LANGUAGE plpgsql AS $$
DECLARE
  v_item    RECORD;
  v_product RECORD;
  v_cif     NUMERIC;
  v_duty    NUMERIC;
  v_tax     NUMERIC;
  v_exrate  NUMERIC;
BEGIN
  SELECT gri.*, gr.customs_exchange_rate
  INTO v_item
  FROM goods_receipt_items gri
  JOIN goods_receipts gr ON gr.id = gri.gr_id
  WHERE gri.id = p_gr_item_id;

  SELECT default_customs_duty_rate, default_commodity_tax_rate
  INTO v_product
  FROM products WHERE id = v_item.product_id;

  v_exrate := COALESCE(p_customs_exchange_rate, v_item.customs_exchange_rate, v_item.unit_price_twd / NULLIF(v_item.unit_price_orig, 0), 1);

  -- CIF value in TWD
  v_cif  := v_item.quantity * v_item.unit_price_orig * v_exrate;
  v_duty := v_cif * COALESCE(v_product.default_customs_duty_rate, 0);
  v_tax  := (v_cif + v_duty) * COALESCE(v_product.default_commodity_tax_rate, 0);

  RETURN QUERY SELECT
    ROUND(v_duty, 0),
    ROUND(v_tax,  0),
    ROUND(v_duty + v_tax, 0);
END;
$$;

-- ============================================================
-- Function: recalculate_landed_costs
-- Allocates all cost components to GR items using chosen method
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_landed_costs(
  p_gr_id           BIGINT,
  p_allocation_method TEXT DEFAULT 'value'  -- 'value', 'qty', 'weight'
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_item         RECORD;
  v_comp         RECORD;
  v_total_basis  NUMERIC;
  v_item_basis   NUMERIC;
  v_ratio        NUMERIC;
  v_alloc        NUMERIC;
  v_base_cost    NUMERIC;
  v_landed_cost  NUMERIC;
  v_comp_allocs  JSONB := '{}'::JSONB;
  v_comp_type    component_type;
BEGIN
  -- Zero out existing allocations on items
  UPDATE goods_receipt_items
  SET allocated_customs_duty   = 0,
      allocated_commodity_tax  = 0,
      allocated_bsmi_fee       = 0,
      allocated_inland_freight = 0,
      allocated_other_cost     = 0,
      landed_unit_cost_twd     = unit_price_twd,
      updated_at               = NOW()
  WHERE gr_id = p_gr_id;

  -- Calculate allocation basis total
  SELECT CASE p_allocation_method
    WHEN 'qty'    THEN SUM(gri.quantity)
    WHEN 'weight' THEN SUM(gri.quantity * COALESCE(p.weight_kg, 1))
    ELSE               SUM(gri.subtotal_twd)
  END
  INTO v_total_basis
  FROM goods_receipt_items gri
  JOIN products p ON p.id = gri.product_id
  WHERE gri.gr_id = p_gr_id;

  IF COALESCE(v_total_basis, 0) = 0 THEN RETURN; END IF;

  -- Process each cost component
  FOR v_comp IN
    SELECT * FROM landed_cost_components WHERE gr_id = p_gr_id
  LOOP
    FOR v_item IN
      SELECT gri.*, p.weight_kg FROM goods_receipt_items gri
      JOIN products p ON p.id = gri.product_id
      WHERE gri.gr_id = p_gr_id
        AND (v_comp.apply_to_all OR gri.product_id = ANY(v_comp.apply_product_ids))
    LOOP
      -- Re-calc basis only for items this component applies to
      SELECT CASE p_allocation_method
        WHEN 'qty'    THEN SUM(gri2.quantity)
        WHEN 'weight' THEN SUM(gri2.quantity * COALESCE(p2.weight_kg, 1))
        ELSE               SUM(gri2.subtotal_twd)
      END
      INTO v_total_basis
      FROM goods_receipt_items gri2
      JOIN products p2 ON p2.id = gri2.product_id
      WHERE gri2.gr_id = p_gr_id
        AND (v_comp.apply_to_all OR gri2.product_id = ANY(v_comp.apply_product_ids));

      v_item_basis := CASE p_allocation_method
        WHEN 'qty'    THEN v_item.quantity
        WHEN 'weight' THEN v_item.quantity * COALESCE(v_item.weight_kg, 1)
        ELSE               v_item.subtotal_twd
      END;

      v_ratio := v_item_basis / NULLIF(v_total_basis, 0);
      v_alloc := ROUND(v_comp.amount_twd * v_ratio, 2);

      -- Accumulate into the right column
      UPDATE goods_receipt_items SET
        allocated_customs_duty   = COALESCE(allocated_customs_duty, 0)   + CASE WHEN v_comp.component_type = 'customs_duty'   THEN v_alloc ELSE 0 END,
        allocated_commodity_tax  = COALESCE(allocated_commodity_tax, 0)  + CASE WHEN v_comp.component_type = 'commodity_tax'  THEN v_alloc ELSE 0 END,
        allocated_bsmi_fee       = COALESCE(allocated_bsmi_fee, 0)       + CASE WHEN v_comp.component_type = 'bsmi_fee'       THEN v_alloc ELSE 0 END,
        allocated_inland_freight = COALESCE(allocated_inland_freight, 0) + CASE WHEN v_comp.component_type IN ('inland_freight','port_handling') THEN v_alloc ELSE 0 END,
        allocated_other_cost     = COALESCE(allocated_other_cost, 0)     + CASE WHEN v_comp.component_type NOT IN ('customs_duty','commodity_tax','bsmi_fee','inland_freight','port_handling') THEN v_alloc ELSE 0 END,
        updated_at = NOW()
      WHERE id = v_item.id;
    END LOOP;
  END LOOP;

  -- Recalculate landed_unit_cost_twd for each item
  UPDATE goods_receipt_items
  SET landed_unit_cost_twd = ROUND(
    (subtotal_twd
     + COALESCE(allocated_customs_duty, 0)
     + COALESCE(allocated_commodity_tax, 0)
     + COALESCE(allocated_bsmi_fee, 0)
     + COALESCE(allocated_inland_freight, 0)
     + COALESCE(allocated_other_cost, 0)
    ) / NULLIF(quantity, 0),
    2
  ),
  updated_at = NOW()
  WHERE gr_id = p_gr_id;

  -- Mark GR as finalized
  UPDATE goods_receipts SET landed_cost_status = 'calculated', allocation_method = p_allocation_method
  WHERE id = p_gr_id;

  -- Update stock batch unit costs with new landed cost
  UPDATE stock_batches sb
  SET unit_cost_twd = gri.landed_unit_cost_twd,
      updated_at = NOW()
  FROM goods_receipt_items gri
  WHERE sb.gr_item_id = gri.id
    AND gri.gr_id = p_gr_id
    AND sb.status != 'depleted'::batch_status;

  -- Generate COGS adjustments for already-sold units from this GR
  -- (If batch was consumed before landed cost finalized, adjust)
  INSERT INTO sales_cogs_adjustments (sd_item_id, batch_id, quantity, estimated_cost, actual_cost, variance)
  SELECT
    sdi.id,
    sb.id,
    sdi.quantity,
    sdi.cogs_twd,
    sdi.quantity * gri.landed_unit_cost_twd,
    (sdi.quantity * gri.landed_unit_cost_twd) - sdi.cogs_twd
  FROM goods_receipt_items gri
  JOIN stock_batches sb ON sb.gr_item_id = gri.id
  JOIN inventory_transactions it ON it.batch_id = sb.id AND it.txn_type = 'sd_out'
  JOIN sales_delivery_items sdi ON sdi.id = it.reference_doc_id AND it.reference_doc_type = 'sd_item'
  WHERE gri.gr_id = p_gr_id
    AND (sdi.quantity * gri.landed_unit_cost_twd) <> sdi.cogs_twd
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- View: v_import_cost_breakdown
-- ============================================================

CREATE VIEW v_import_cost_breakdown AS
SELECT
  gr.id AS gr_id, gr.gr_number, gr.received_date,
  gr.currency_code, gr.exchange_rate,
  gr.landed_cost_status, gr.allocation_method,
  p.id AS product_id, p.sku, p.name AS product_name,
  s.name AS supplier_name,
  gri.quantity,
  gri.unit_price_orig, gri.unit_price_twd,
  gri.subtotal_twd AS cif_value_twd,
  COALESCE(gri.allocated_customs_duty,   0) AS customs_duty,
  COALESCE(gri.allocated_commodity_tax,  0) AS commodity_tax,
  COALESCE(gri.allocated_bsmi_fee,       0) AS bsmi_fee,
  COALESCE(gri.allocated_inland_freight, 0) AS inland_freight,
  COALESCE(gri.allocated_other_cost,     0) AS other_cost,
  COALESCE(gri.landed_unit_cost_twd, gri.unit_price_twd) AS landed_unit_cost,
  (COALESCE(gri.allocated_customs_duty,0)
   + COALESCE(gri.allocated_commodity_tax,0)
   + COALESCE(gri.allocated_bsmi_fee,0)
   + COALESCE(gri.allocated_inland_freight,0)
   + COALESCE(gri.allocated_other_cost,0)) AS total_tax_and_cost
FROM goods_receipt_items gri
JOIN goods_receipts gr ON gr.id = gri.gr_id
JOIN products p ON p.id = gri.product_id
JOIN suppliers s ON s.id = gr.supplier_id;

COMMIT;
