-- Phase 1: Base data layer
-- ENUMs, core tables, indexes, triggers, seed data

BEGIN;

-- Enable pg_trgm for Chinese fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- ENUMs
-- ============================================================

CREATE TYPE user_role AS ENUM ('owner', 'manager', 'sales', 'warehouse', 'accounting', 'viewer');

CREATE TYPE entity_status AS ENUM ('active', 'inactive', 'suspended');

CREATE TYPE customer_tier AS ENUM ('retail', 'dealer', 'distributor', 'key_account');

CREATE TYPE party_type AS ENUM ('supplier', 'customer', 'both');

CREATE TYPE warehouse_type AS ENUM ('main', 'bonded', 'transit', 'consignment', 'other');

-- ============================================================
-- updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Reference tables
-- ============================================================

CREATE TABLE currencies (
  code        CHAR(3) PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  symbol      VARCHAR(10),
  is_base     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE countries (
  code        CHAR(2) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  currency_code CHAR(3) REFERENCES currencies(code),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- Core tables
-- ============================================================

CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(50) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255) UNIQUE,
  role            user_role NOT NULL DEFAULT 'viewer',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE warehouses (
  id              BIGSERIAL PRIMARY KEY,
  code            VARCHAR(20) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  type            warehouse_type NOT NULL DEFAULT 'main',
  address         TEXT,
  status          entity_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_kinds (
  id              BIGSERIAL PRIMARY KEY,
  code            VARCHAR(20) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id                      BIGSERIAL PRIMARY KEY,
  sku                     VARCHAR(50) NOT NULL UNIQUE,
  name                    VARCHAR(200) NOT NULL,
  name_en                 VARCHAR(200),
  kind_id                 BIGINT REFERENCES product_kinds(id),
  unit                    VARCHAR(20) NOT NULL DEFAULT '條',
  list_price              NUMERIC(14,4) NOT NULL DEFAULT 0,
  cost_price              NUMERIC(14,4),
  currency_code           CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  barcode                 VARCHAR(100),
  spec                    TEXT,
  brand                   VARCHAR(100),
  country_of_origin       CHAR(2) REFERENCES countries(code),
  min_stock_qty           NUMERIC(14,4) NOT NULL DEFAULT 0,
  max_stock_qty           NUMERIC(14,4),
  reorder_point           NUMERIC(14,4) NOT NULL DEFAULT 0,
  weight_kg               NUMERIC(10,4),
  volume_cbm              NUMERIC(10,6),
  default_customs_duty_rate    NUMERIC(7,4),
  default_commodity_tax_rate   NUMERIC(7,4),
  requires_bsmi           BOOLEAN NOT NULL DEFAULT FALSE,
  status                  entity_status NOT NULL DEFAULT 'active',
  deleted_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE suppliers (
  id                  BIGSERIAL PRIMARY KEY,
  code                VARCHAR(20) NOT NULL UNIQUE,
  name                VARCHAR(200) NOT NULL,
  name_en             VARCHAR(200),
  country_code        CHAR(2) REFERENCES countries(code),
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  contact_person      VARCHAR(100),
  phone               VARCHAR(50),
  email               VARCHAR(255),
  address             TEXT,
  payment_terms       SMALLINT NOT NULL DEFAULT 30,
  tax_id              VARCHAR(50),
  bank_info           TEXT,
  status              entity_status NOT NULL DEFAULT 'active',
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id                  BIGSERIAL PRIMARY KEY,
  code                VARCHAR(20) NOT NULL UNIQUE,
  name                VARCHAR(200) NOT NULL,
  name_en             VARCHAR(200),
  tier                customer_tier NOT NULL DEFAULT 'retail',
  country_code        CHAR(2) REFERENCES countries(code),
  currency_code       CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  contact_person      VARCHAR(100),
  phone               VARCHAR(50),
  email               VARCHAR(255),
  address             TEXT,
  tax_id              VARCHAR(50),
  credit_limit        NUMERIC(16,4) NOT NULL DEFAULT 0,
  payment_terms       SMALLINT NOT NULL DEFAULT 30,
  status              entity_status NOT NULL DEFAULT 'active',
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_tier_discounts (
  id              BIGSERIAL PRIMARY KEY,
  tier            customer_tier NOT NULL UNIQUE,
  discount_rate   NUMERIC(5,4) NOT NULL DEFAULT 0,
  description     VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_product_prices (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     BIGINT NOT NULL REFERENCES customers(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  price           NUMERIC(14,4) NOT NULL,
  currency_code   CHAR(3) NOT NULL DEFAULT 'TWD' REFERENCES currencies(code),
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, product_id, effective_from)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE is_active = TRUE;

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);
CREATE INDEX idx_products_kind ON products(kind_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_status ON products(status);

CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_suppliers_name_trgm ON suppliers USING GIN(name gin_trgm_ops);
CREATE INDEX idx_suppliers_status ON suppliers(status) WHERE deleted_at IS NULL;

CREATE INDEX idx_customers_code ON customers(code);
CREATE INDEX idx_customers_name_trgm ON customers USING GIN(name gin_trgm_ops);
CREATE INDEX idx_customers_tier ON customers(tier) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_status ON customers(status);

CREATE INDEX idx_customer_product_prices_customer ON customer_product_prices(customer_id) WHERE is_active = TRUE;
CREATE INDEX idx_customer_product_prices_product ON customer_product_prices(product_id) WHERE is_active = TRUE;

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_product_kinds_updated_at
  BEFORE UPDATE ON product_kinds
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_customer_tier_discounts_updated_at
  BEFORE UPDATE ON customer_tier_discounts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_customer_product_prices_updated_at
  BEFORE UPDATE ON customer_product_prices
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ============================================================
-- Helper function: get_customer_price
-- ============================================================

CREATE OR REPLACE FUNCTION get_customer_price(
  p_customer_id BIGINT,
  p_product_id  BIGINT,
  OUT price_twd NUMERIC,
  OUT price_source VARCHAR
)
LANGUAGE plpgsql AS $$
DECLARE
  v_list_price    NUMERIC;
  v_tier          customer_tier;
  v_discount_rate NUMERIC;
  v_special_price NUMERIC;
BEGIN
  SELECT list_price INTO v_list_price FROM products WHERE id = p_product_id;
  SELECT tier INTO v_tier FROM customers WHERE id = p_customer_id;

  -- Check special price first
  SELECT cpp.price INTO v_special_price
  FROM customer_product_prices cpp
  WHERE cpp.customer_id = p_customer_id
    AND cpp.product_id  = p_product_id
    AND cpp.is_active   = TRUE
    AND cpp.effective_from <= CURRENT_DATE
    AND (cpp.effective_to IS NULL OR cpp.effective_to >= CURRENT_DATE)
  ORDER BY cpp.effective_from DESC
  LIMIT 1;

  IF v_special_price IS NOT NULL THEN
    price_twd    := v_special_price;
    price_source := 'special';
    RETURN;
  END IF;

  -- Tier discount
  SELECT discount_rate INTO v_discount_rate
  FROM customer_tier_discounts
  WHERE tier = v_tier;

  IF v_discount_rate IS NOT NULL AND v_discount_rate > 0 THEN
    price_twd    := v_list_price * (1 - v_discount_rate);
    price_source := 'tier';
    RETURN;
  END IF;

  price_twd    := v_list_price;
  price_source := 'list';
END;
$$;

-- ============================================================
-- Seed data: currencies
-- ============================================================

INSERT INTO currencies (code, name, symbol, is_base) VALUES
  ('TWD', '新台幣', 'NT$', TRUE),
  ('USD', '美元', '$', FALSE),
  ('JPY', '日圓', '¥', FALSE),
  ('CNY', '人民幣', '¥', FALSE),
  ('EUR', '歐元', '€', FALSE),
  ('VND', '越南盾', '₫', FALSE),
  ('THB', '泰銖', '฿', FALSE);

-- ============================================================
-- Seed data: countries
-- ============================================================

INSERT INTO countries (code, name, currency_code) VALUES
  ('TW', '台灣', 'TWD'),
  ('JP', '日本', 'JPY'),
  ('CN', '中國', 'CNY'),
  ('VN', '越南', 'VND'),
  ('TH', '泰國', 'THB'),
  ('ID', '印尼', 'USD'),
  ('IT', '義大利', 'EUR'),
  ('US', '美國', 'USD');

-- ============================================================
-- Seed data: warehouses
-- ============================================================

INSERT INTO warehouses (code, name, type) VALUES
  ('MAIN',    '主倉庫',   'main'),
  ('BOND',    '保稅倉庫', 'bonded'),
  ('TRANSIT', '在途倉庫', 'transit');

-- ============================================================
-- Seed data: customer_tier_discounts
-- ============================================================

INSERT INTO customer_tier_discounts (tier, discount_rate, description) VALUES
  ('retail',       0,      '零售客戶 - 無折扣'),
  ('dealer',       0.05,   '經銷商 - 95折'),
  ('distributor',  0.10,   '大盤商 - 9折'),
  ('key_account',  0.15,   '大客戶 - 85折');

COMMIT;
