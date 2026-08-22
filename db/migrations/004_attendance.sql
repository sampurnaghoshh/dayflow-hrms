-- 004_attendance.sql
-- Append-only, same as the ledger.
CREATE TABLE attendance_punches (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  punch_at        TIMESTAMPTZ NOT NULL DEFAULT now(),   -- SERVER time only
  direction       punch_direction NOT NULL,
  source          TEXT NOT NULL DEFAULT 'WEB',
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON attendance_punches (employee_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_punch_day ON attendance_punches (employee_id, punch_at DESC);

-- Derived state. Safe to recompute from punches at any time.
CREATE TABLE attendance_days (
  employee_id      BIGINT NOT NULL REFERENCES employees(id),
  work_date        DATE NOT NULL,
  status           day_status NOT NULL,
  worked_minutes   INTEGER NOT NULL DEFAULT 0,
  first_in         TIMESTAMPTZ,
  last_out         TIMESTAMPTZ,
  leave_request_id BIGINT REFERENCES leave_requests(id),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, work_date)
);
CREATE INDEX ON attendance_days (work_date, status);
