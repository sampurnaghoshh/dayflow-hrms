-- 005_payroll.sql  (SRS 3.6)
-- Salary structures are VERSIONED, never edited in place.
CREATE TABLE employee_salary_versions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES employees(id),
  effective_from DATE NOT NULL,
  effective_to   DATE,                                  -- NULL = current
  ctc_annual     NUMERIC(12,2) NOT NULL CHECK (ctc_annual > 0),
  created_by     BIGINT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  validity       daterange GENERATED ALWAYS AS
                   (daterange(effective_from, effective_to, '[)')) STORED,
  -- One employee cannot have two salary structures active on the same day.
  CONSTRAINT no_overlapping_salary EXCLUDE USING gist (
    employee_id WITH =, validity WITH &&
  )
);

CREATE TABLE salary_components (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  salary_version_id BIGINT NOT NULL REFERENCES employee_salary_versions(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,        -- BASIC, HRA, SPECIAL, PF, PT
  label             TEXT NOT NULL,
  kind              component_kind NOT NULL,
  monthly_amount    NUMERIC(12,2) NOT NULL CHECK (monthly_amount >= 0),
  UNIQUE (salary_version_id, code)
);

CREATE TABLE payslips (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES employees(id),
  period_month      DATE NOT NULL,        -- always the 1st of the month
  salary_version_id BIGINT NOT NULL REFERENCES employee_salary_versions(id),
  payable_days      NUMERIC(5,2) NOT NULL,
  lop_days          NUMERIC(5,2) NOT NULL DEFAULT 0,
  gross_earnings    NUMERIC(12,2) NOT NULL,
  total_deductions  NUMERIC(12,2) NOT NULL,
  net_pay           NUMERIC(12,2) NOT NULL,
  generated_by      BIGINT NOT NULL REFERENCES users(id),
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)      -- makes payroll runs idempotent
);

CREATE TABLE payslip_line_items (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payslip_id BIGINT NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  label      TEXT NOT NULL,
  kind       component_kind NOT NULL,
  amount     NUMERIC(12,2) NOT NULL
);
CREATE INDEX ON payslip_line_items (payslip_id);
