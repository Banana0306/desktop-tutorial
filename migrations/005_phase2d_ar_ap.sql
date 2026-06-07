-- Phase 2D: AR/AP with multi-currency forex gain/loss

BEGIN;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE ar_status     AS ENUM ('pending', 'partial', 'paid', 'overdue', 'written_off');
CREATE TYPE ap_status     AS ENUM ('pending', 'partial', 'paid', 'overdue');
CREATE TYPE receipt_status AS ENUM ('draft', 'completed', 'bounced', 'reversed');
CREATE TYPE payment_status AS ENUM ('draft', 'completed', 'reversed');
CREATE TYPE payment_method_type AS ENUM ('cash', 'bank_transfer', 'check', 'credit_card', 'other');
CREATE TYPE alloc_status  AS ENUM ('active', 'reversed');

-- ============================================================
-- Reference: payment methods
-- ============================================================

CREATE TABLE payment_methods (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(50) NOT NULL,
  type        payment_method_type NOT NULL DEFAULT 'other',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO payment_methods (code, name, type) VALUES
  ('CASH',  '現金',   'cash'),
  ('WIRE',  '電匯',   'bank_transfer'),
  ('CHECK', '支票',   'check'),
  ('CARD',  '信用卡', 'credit_card');

-- ============================================================
-- AR Invoices (automatically created on SD completion)
-- ============================================================

CREATE TABLE ar_invoices (
  id                  BIGSERIAL PRIMARY KEY,
  invoice_number      VARCHAR(30) NOT NULL UNIQUE,
  customer_id         BIGINT NOT NULL REFERENCES customers(id),
  sd_id               BIGINT REFERENCES sales_deliveries(id),
  so_id               BIGINT REFERENCES sales_orders(id),
  status              ar_status NOT NULL DEFAULT 'pending',
  invoice_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE NOT NULL,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  amount_orig         NUMERIC(16,4) NOT NULL,
  amount_twd          NUMERIC(16,4) NOT NULL,
  amount_paid_twd     NUMERIC(16,4) NOT NULL DEFAULT 0,
  amount_remaining    NUMERIC(16,4) NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AR Receipts (customer payments)
-- ============================================================

CREATE TABLE ar_receipts (
  id                  BIGSERIAL PRIMARY KEY,
  receipt_number      VARCHAR(30) NOT NULL UNIQUE,
  customer_id         BIGINT NOT NULL REFERENCES customers(id),
  status              receipt_status NOT NULL DEFAULT 'draft',
  payment_method_id   BIGINT REFERENCES payment_methods(id),
  receipt_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  amount_orig         NUMERIC(16,4) NOT NULL,
  amount_twd          NUMERIC(16,4) NOT NULL,
  check_number        VARCHAR(50),
  check_due_date      DATE,
  bank_name           VARCHAR(100),
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AR Receipt Allocations (maps receipt → invoices)
-- ============================================================

CREATE TABLE ar_receipt_allocations (
  id                      BIGSERIAL PRIMARY KEY,
  receipt_id              BIGINT NOT NULL REFERENCES ar_receipts(id),
  invoice_id              BIGINT NOT NULL REFERENCES ar_invoices(id),
  status                  alloc_status NOT NULL DEFAULT 'active',
  allocated_amount_orig   NUMERIC(16,4) NOT NULL,
  allocated_amount_twd    NUMERIC(16,4) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AP Bills (automatically created on GR completion)
-- ============================================================

CREATE TABLE ap_bills (
  id                  BIGSERIAL PRIMARY KEY,
  bill_number         VARCHAR(30) NOT NULL UNIQUE,
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  gr_id               BIGINT REFERENCES goods_receipts(id),
  po_id               BIGINT REFERENCES purchase_orders(id),
  status              ap_status NOT NULL DEFAULT 'pending',
  bill_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE NOT NULL,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  amount_orig         NUMERIC(16,4) NOT NULL,
  amount_twd          NUMERIC(16,4) NOT NULL,
  amount_paid_twd     NUMERIC(16,4) NOT NULL DEFAULT 0,
  amount_remaining    NUMERIC(16,4) NOT NULL,
  forex_gain_loss_twd NUMERIC(16,4) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AP Payments (supplier payments)
-- ============================================================

CREATE TABLE ap_payments (
  id                  BIGSERIAL PRIMARY KEY,
  payment_number      VARCHAR(30) NOT NULL UNIQUE,
  supplier_id         BIGINT NOT NULL REFERENCES suppliers(id),
  status              payment_status NOT NULL DEFAULT 'draft',
  payment_method_id   BIGINT REFERENCES payment_methods(id),
  payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  exchange_rate       NUMERIC(12,6) NOT NULL DEFAULT 1,
  amount_orig         NUMERIC(16,4) NOT NULL,
  amount_twd          NUMERIC(16,4) NOT NULL,
  notes               TEXT,
  completed_at        TIMESTAMPTZ,
  created_by          BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AP Payment Allocations (maps payment → bills, with forex)
-- ============================================================

CREATE TABLE ap_payment_allocations (
  id                          BIGSERIAL PRIMARY KEY,
  payment_id                  BIGINT NOT NULL REFERENCES ap_payments(id),
  bill_id                     BIGINT NOT NULL REFERENCES ap_bills(id),
  status                      alloc_status NOT NULL DEFAULT 'active',
  allocated_amount_orig       NUMERIC(16,4) NOT NULL,
  bill_exchange_rate          NUMERIC(12,6) NOT NULL,
  payment_exchange_rate       NUMERIC(12,6) NOT NULL,
  allocated_amount_twd_at_bill    NUMERIC(16,4) NOT NULL,
  allocated_amount_twd_actual     NUMERIC(16,4) NOT NULL,
  forex_gain_loss             NUMERIC(16,4) NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_ar_invoices_customer ON ar_invoices(customer_id);
CREATE INDEX idx_ar_invoices_status ON ar_invoices(status);
CREATE INDEX idx_ar_invoices_due_date ON ar_invoices(due_date);
CREATE INDEX idx_ar_invoices_sd ON ar_invoices(sd_id);

CREATE INDEX idx_ar_receipts_customer ON ar_receipts(customer_id);
CREATE INDEX idx_ar_receipts_status ON ar_receipts(status);

CREATE INDEX idx_ar_alloc_receipt ON ar_receipt_allocations(receipt_id);
CREATE INDEX idx_ar_alloc_invoice ON ar_receipt_allocations(invoice_id);

CREATE INDEX idx_ap_bills_supplier ON ap_bills(supplier_id);
CREATE INDEX idx_ap_bills_status ON ap_bills(status);
CREATE INDEX idx_ap_bills_due_date ON ap_bills(due_date);
CREATE INDEX idx_ap_bills_gr ON ap_bills(gr_id);

CREATE INDEX idx_ap_payments_supplier ON ap_payments(supplier_id);
CREATE INDEX idx_ap_payments_status ON ap_payments(status);

CREATE INDEX idx_ap_alloc_payment ON ap_payment_allocations(payment_id);
CREATE INDEX idx_ap_alloc_bill ON ap_payment_allocations(bill_id);

-- ============================================================
-- Helper: doc number generator (reuse pattern)
-- ============================================================

-- AR auto-create trigger on SD completion
CREATE OR REPLACE FUNCTION trg_sd_create_ar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_customer    RECORD;
  v_so          RECORD;
  v_inv_num     TEXT;
  v_ym          TEXT;
  v_seq         INT;
  v_due_date    DATE;
BEGIN
  IF NEW.status = 'completed'::sd_status AND OLD.status <> 'completed'::sd_status THEN
    SELECT c.id, c.payment_terms, c.currency_code
    INTO v_customer
    FROM sales_deliveries sd
    JOIN customers c ON c.id = sd.customer_id
    WHERE sd.id = NEW.id;

    SELECT so.id, so.currency_code, so.exchange_rate,
           so.total_amount_twd
    INTO v_so
    FROM sales_orders so
    WHERE so.id = NEW.so_id;

    v_due_date := CURRENT_DATE + COALESCE(v_customer.payment_terms, 30);
    v_ym       := TO_CHAR(NOW(), 'YYYYMM');
    SELECT COUNT(*) + 1 INTO v_seq FROM ar_invoices WHERE invoice_number LIKE 'AR-' || v_ym || '-%';
    v_inv_num  := 'AR-' || v_ym || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- Amount = SD's items total
    INSERT INTO ar_invoices (
      invoice_number, customer_id, sd_id, so_id, status,
      invoice_date, due_date,
      currency_code, exchange_rate,
      amount_orig, amount_twd, amount_remaining
    )
    SELECT v_inv_num, NEW.customer_id, NEW.id, NEW.so_id, 'pending'::ar_status,
           CURRENT_DATE, v_due_date,
           so.currency_code, so.exchange_rate,
           COALESCE(SUM(sdi.subtotal_twd / so.exchange_rate), 0),
           COALESCE(SUM(sdi.subtotal_twd), 0),
           COALESCE(SUM(sdi.subtotal_twd), 0)
    FROM sales_delivery_items sdi
    JOIN sales_orders so ON so.id = NEW.so_id
    WHERE sdi.sd_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sd_create_ar
  AFTER UPDATE ON sales_deliveries
  FOR EACH ROW EXECUTE FUNCTION trg_sd_create_ar();

-- AP auto-create trigger on GR completion
CREATE OR REPLACE FUNCTION trg_gr_create_ap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_supplier  RECORD;
  v_bill_num  TEXT;
  v_ym        TEXT;
  v_seq       INT;
  v_due_date  DATE;
BEGIN
  IF NEW.status = 'completed'::gr_status AND OLD.status <> 'completed'::gr_status THEN
    SELECT s.id, s.payment_terms, s.currency_code
    INTO v_supplier
    FROM suppliers s
    WHERE s.id = NEW.supplier_id;

    v_due_date := CURRENT_DATE + COALESCE(v_supplier.payment_terms, 30);
    v_ym       := TO_CHAR(NOW(), 'YYYYMM');
    SELECT COUNT(*) + 1 INTO v_seq FROM ap_bills WHERE bill_number LIKE 'AP-' || v_ym || '-%';
    v_bill_num := 'AP-' || v_ym || '-' || LPAD(v_seq::TEXT, 4, '0');

    INSERT INTO ap_bills (
      bill_number, supplier_id, gr_id, po_id, status,
      bill_date, due_date,
      currency_code, exchange_rate,
      amount_orig, amount_twd, amount_remaining
    ) VALUES (
      v_bill_num, NEW.supplier_id, NEW.id, NEW.po_id, 'pending'::ap_status,
      CURRENT_DATE, v_due_date,
      NEW.currency_code, NEW.exchange_rate,
      NEW.total_amount_orig, NEW.total_amount_twd, NEW.total_amount_twd
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gr_create_ap
  AFTER UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_gr_create_ap();

-- ============================================================
-- Reconciliation trigger: AR receipt complete → allocate
-- ============================================================

CREATE OR REPLACE FUNCTION trg_receipt_complete_allocate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_remaining   NUMERIC;
  v_inv         RECORD;
  v_alloc_orig  NUMERIC;
  v_alloc_twd   NUMERIC;
BEGIN
  IF NEW.status = 'completed'::receipt_status AND OLD.status <> 'completed'::receipt_status THEN
    v_remaining := NEW.amount_twd;

    -- Allocate to oldest pending invoices first
    FOR v_inv IN
      SELECT * FROM ar_invoices
      WHERE customer_id = NEW.customer_id
        AND status IN ('pending'::ar_status, 'partial'::ar_status, 'overdue'::ar_status)
        AND amount_remaining > 0
      ORDER BY due_date ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_alloc_twd  := LEAST(v_inv.amount_remaining, v_remaining);
      v_alloc_orig := v_alloc_twd / NEW.exchange_rate;

      INSERT INTO ar_receipt_allocations (receipt_id, invoice_id, allocated_amount_orig, allocated_amount_twd)
      VALUES (NEW.id, v_inv.id, v_alloc_orig, v_alloc_twd);

      UPDATE ar_invoices
      SET amount_paid_twd  = amount_paid_twd + v_alloc_twd,
          amount_remaining = amount_remaining - v_alloc_twd,
          status = CASE
            WHEN amount_remaining - v_alloc_twd <= 0 THEN 'paid'::ar_status
            ELSE 'partial'::ar_status
          END,
          updated_at = NOW()
      WHERE id = v_inv.id;

      v_remaining := v_remaining - v_alloc_twd;
    END LOOP;
  END IF;

  -- Bounce: reverse all allocations
  IF NEW.status = 'bounced'::receipt_status AND OLD.status = 'completed'::receipt_status THEN
    -- Reverse allocations
    FOR v_inv IN
      SELECT ara.invoice_id, ara.allocated_amount_twd
      FROM ar_receipt_allocations ara
      WHERE ara.receipt_id = NEW.id AND ara.status = 'active'::alloc_status
    LOOP
      UPDATE ar_invoices
      SET amount_paid_twd  = amount_paid_twd - v_inv.allocated_amount_twd,
          amount_remaining = amount_remaining + v_inv.allocated_amount_twd,
          status = CASE
            WHEN amount_paid_twd - v_inv.allocated_amount_twd <= 0 THEN 'pending'::ar_status
            ELSE 'partial'::ar_status
          END,
          updated_at = NOW()
      WHERE id = v_inv.invoice_id;
    END LOOP;

    UPDATE ar_receipt_allocations SET status = 'reversed'::alloc_status WHERE receipt_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_receipt_complete_allocate
  AFTER UPDATE ON ar_receipts
  FOR EACH ROW EXECUTE FUNCTION trg_receipt_complete_allocate();

-- ============================================================
-- Reconciliation trigger: AP payment complete → allocate + forex
-- ============================================================

CREATE OR REPLACE FUNCTION trg_payment_complete_allocate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_remaining   NUMERIC;
  v_bill        RECORD;
  v_alloc_orig  NUMERIC;
  v_alloc_at_bill  NUMERIC;
  v_alloc_actual   NUMERIC;
  v_forex          NUMERIC;
BEGIN
  IF NEW.status = 'completed'::payment_status AND OLD.status <> 'completed'::payment_status THEN
    v_remaining := NEW.amount_orig;

    FOR v_bill IN
      SELECT * FROM ap_bills
      WHERE supplier_id = NEW.supplier_id
        AND currency_code = NEW.currency_code
        AND status IN ('pending'::ap_status, 'partial'::ap_status, 'overdue'::ap_status)
        AND amount_remaining > 0
      ORDER BY due_date ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_alloc_orig    := LEAST(v_bill.amount_remaining / v_bill.exchange_rate, v_remaining);
      v_alloc_at_bill := v_alloc_orig * v_bill.exchange_rate;
      v_alloc_actual  := v_alloc_orig * NEW.exchange_rate;
      -- Positive = gain (paid less TWD than booked), negative = loss
      v_forex         := v_alloc_at_bill - v_alloc_actual;

      INSERT INTO ap_payment_allocations (
        payment_id, bill_id,
        allocated_amount_orig,
        bill_exchange_rate, payment_exchange_rate,
        allocated_amount_twd_at_bill,
        allocated_amount_twd_actual,
        forex_gain_loss
      ) VALUES (
        NEW.id, v_bill.id,
        v_alloc_orig,
        v_bill.exchange_rate, NEW.exchange_rate,
        v_alloc_at_bill, v_alloc_actual, v_forex
      );

      UPDATE ap_bills
      SET amount_paid_twd     = amount_paid_twd + v_alloc_actual,
          amount_remaining    = amount_remaining - v_alloc_at_bill,
          forex_gain_loss_twd = forex_gain_loss_twd + v_forex,
          status = CASE
            WHEN amount_remaining - v_alloc_at_bill <= 0 THEN 'paid'::ap_status
            ELSE 'partial'::ap_status
          END,
          updated_at = NOW()
      WHERE id = v_bill.id;

      v_remaining := v_remaining - v_alloc_orig;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_complete_allocate
  AFTER UPDATE ON ap_payments
  FOR EACH ROW EXECUTE FUNCTION trg_payment_complete_allocate();

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_ar_invoices_updated_at BEFORE UPDATE ON ar_invoices FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_ar_receipts_updated_at BEFORE UPDATE ON ar_receipts FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_ap_bills_updated_at BEFORE UPDATE ON ap_bills FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_ap_payments_updated_at BEFORE UPDATE ON ap_payments FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- Aging Views
-- ============================================================

CREATE VIEW v_ar_aging AS
SELECT
  c.id AS customer_id, c.name AS customer_name, c.tier,
  ar.id AS invoice_id, ar.invoice_number,
  ar.due_date, ar.currency_code, ar.exchange_rate,
  ar.amount_orig, ar.amount_twd, ar.amount_remaining,
  CURRENT_DATE - ar.due_date AS days_overdue,
  CASE
    WHEN CURRENT_DATE <= ar.due_date           THEN '未到期'
    WHEN CURRENT_DATE - ar.due_date <= 30      THEN '1-30天'
    WHEN CURRENT_DATE - ar.due_date <= 60      THEN '31-60天'
    WHEN CURRENT_DATE - ar.due_date <= 90      THEN '61-90天'
    ELSE '90天以上'
  END AS aging_bucket
FROM ar_invoices ar
JOIN customers c ON c.id = ar.customer_id
WHERE ar.status NOT IN ('paid', 'written_off')
  AND ar.amount_remaining > 0;

CREATE VIEW v_ap_aging AS
SELECT
  s.id AS supplier_id, s.name AS supplier_name,
  ap.id AS bill_id, ap.bill_number,
  ap.due_date, ap.currency_code, ap.exchange_rate,
  ap.amount_orig, ap.amount_twd, ap.amount_remaining,
  ap.forex_gain_loss_twd,
  CURRENT_DATE - ap.due_date AS days_overdue,
  CASE
    WHEN CURRENT_DATE <= ap.due_date           THEN '未到期'
    WHEN CURRENT_DATE - ap.due_date <= 30      THEN '1-30天'
    WHEN CURRENT_DATE - ap.due_date <= 60      THEN '31-60天'
    WHEN CURRENT_DATE - ap.due_date <= 90      THEN '61-90天'
    ELSE '90天以上'
  END AS aging_bucket
FROM ap_bills ap
JOIN suppliers s ON s.id = ap.supplier_id
WHERE ap.status NOT IN ('paid')
  AND ap.amount_remaining > 0;

CREATE VIEW v_check_alerts AS
SELECT
  r.id AS receipt_id, r.receipt_number,
  c.name AS customer_name,
  r.check_number, r.check_due_date, r.amount_twd,
  r.status,
  CASE
    WHEN r.check_due_date <= CURRENT_DATE + 7   THEN '7天內到期'
    WHEN r.check_due_date <= CURRENT_DATE + 30  THEN '30天內到期'
    ELSE '30天以上'
  END AS alert_level
FROM ar_receipts r
JOIN customers c ON c.id = r.customer_id
WHERE r.payment_method_id = (SELECT id FROM payment_methods WHERE code = 'CHECK')
  AND r.status = 'completed'::receipt_status
  AND r.check_due_date IS NOT NULL
  AND r.check_due_date >= CURRENT_DATE;

COMMIT;
