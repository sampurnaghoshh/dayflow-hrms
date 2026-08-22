-- 003_leave_core.sql
CREATE TABLE leave_types (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              TEXT UNIQUE NOT NULL,        -- PAID, SICK, UNPAID
  name              TEXT NOT NULL,
  is_paid           BOOLEAN NOT NULL,
  accrual_per_month NUMERIC(5,2) NOT NULL DEFAULT 0,
  annual_cap        NUMERIC(5,2),
  carry_forward_cap NUMERIC(5,2) NOT NULL DEFAULT 0,
  requires_document BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true
);

-- THE STAR TABLE. Append-only. Never UPDATE, never DELETE.
CREATE TABLE leave_balance_ledger (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id    BIGINT NOT NULL REFERENCES employees(id),
  leave_type_id  BIGINT NOT NULL REFERENCES leave_types(id),
  delta          NUMERIC(6,2) NOT NULL CHECK (delta <> 0),
  reason         ledger_reason NOT NULL,
  ref_request_id BIGINT,                        -- FK added after leave_requests exists
  note           TEXT,
  created_by     BIGINT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_balance_lookup
  ON leave_balance_ledger (employee_id, leave_type_id) INCLUDE (delta);
CREATE INDEX ON leave_balance_ledger (ref_request_id);

CREATE TABLE leave_requests (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   BIGINT NOT NULL REFERENCES employees(id),
  leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  day_count     NUMERIC(5,2) NOT NULL CHECK (day_count > 0),
  remarks       TEXT,
  status        leave_status NOT NULL DEFAULT 'PENDING',
  current_step  SMALLINT NOT NULL DEFAULT 1,
  period        daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  CONSTRAINT valid_range CHECK (end_date >= start_date),
  -- No employee can hold two live requests over the same dates. Enforced by the DB, not by code.
  CONSTRAINT no_overlapping_live_leave EXCLUDE USING gist (
    employee_id WITH =, period WITH &&
  ) WHERE (status IN ('PENDING','APPROVED'))
);
CREATE INDEX ON leave_requests (status, created_at DESC);
CREATE INDEX ON leave_requests (employee_id, created_at DESC);

ALTER TABLE leave_balance_ledger
  ADD CONSTRAINT fk_ledger_request FOREIGN KEY (ref_request_id) REFERENCES leave_requests(id);

-- Routing rules live here, NOT in JavaScript.
CREATE TABLE approval_chain_rules (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  leave_type_id BIGINT REFERENCES leave_types(id),  -- NULL = applies to all types
  min_days      NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_days      NUMERIC(5,2) NOT NULL DEFAULT 999,
  step_no       SMALLINT NOT NULL,
  approver_role user_role NOT NULL,
  UNIQUE (leave_type_id, min_days, max_days, step_no)
);

CREATE TABLE approval_steps (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id      BIGINT NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  step_no         SMALLINT NOT NULL,
  approver_role   user_role NOT NULL,
  approver_user_id BIGINT REFERENCES users(id),     -- filled at decision time
  status          step_status NOT NULL DEFAULT 'PENDING',
  comment         TEXT,
  acted_at        TIMESTAMPTZ,
  UNIQUE (request_id, step_no)
);
CREATE INDEX ON approval_steps (status, approver_role);

CREATE TABLE holidays (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  holiday_date DATE UNIQUE NOT NULL,
  name         TEXT NOT NULL
);
