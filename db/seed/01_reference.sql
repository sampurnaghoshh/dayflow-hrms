-- 01_reference.sql
-- Reference data: the policy configuration the application reads at runtime.
-- Safe to run repeatedly. Natural keys (code, holiday_date) carry the idempotency.
--
-- Run with:
--   docker exec -i dayflow-postgres psql -U dayflow -d dayflow < db/seed/01_reference.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
INSERT INTO departments (code, name) VALUES
  ('ENG', 'Engineering'),
  ('SLS', 'Sales'),
  ('FIN', 'Finance'),
  ('PPL', 'People Operations')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ---------------------------------------------------------------------------
-- Leave types
--
-- accrual_per_month and annual_cap are policy, not code: changing the paid-leave
-- entitlement is an UPDATE here, never an edit to a service.
--
-- requires_document is deliberately false on every type. CLAUDE.md §5.1 defines no
-- document gate in the apply-for-leave algorithm, so setting the flag true would
-- advertise an enforcement rule that does not exist. Flip it when the rule does.
-- ---------------------------------------------------------------------------
INSERT INTO leave_types (code, name, is_paid, accrual_per_month, annual_cap, carry_forward_cap, requires_document, is_active) VALUES
  ('PAID',   'Paid Leave',   true,  1.5, 18,   6, false, true),
  ('SICK',   'Sick Leave',   true,  0.5,  6,   0, false, true),
  ('UNPAID', 'Unpaid Leave', false, 0,   NULL, 0, false, true)
ON CONFLICT (code) DO UPDATE SET
  name              = EXCLUDED.name,
  is_paid           = EXCLUDED.is_paid,
  accrual_per_month = EXCLUDED.accrual_per_month,
  annual_cap        = EXCLUDED.annual_cap,
  carry_forward_cap = EXCLUDED.carry_forward_cap,
  requires_document = EXCLUDED.requires_document,
  is_active         = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- Public holidays, India, 2026
--
-- Excluded from day_count by businessDaysBetween (§5.1) and resolved to HOLIDAY
-- by the attendance derivation (§5.3).
-- ---------------------------------------------------------------------------
INSERT INTO holidays (holiday_date, name) VALUES
  ('2026-01-26', 'Republic Day'),
  ('2026-03-04', 'Holi'),
  ('2026-04-03', 'Good Friday'),
  ('2026-08-15', 'Independence Day'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-10-20', 'Dussehra'),
  ('2026-11-08', 'Diwali'),
  ('2026-12-25', 'Christmas Day')
ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name;

-- ---------------------------------------------------------------------------
-- Approval chain rules  --  THE ROUTING TABLE
--
-- This is the whole point of CLAUDE.md §1.3: adding an approval level is an INSERT
-- here, not an `if (days > 5)` in a service. §5.1 reads it with:
--
--   SELECT * FROM approval_chain_rules
--    WHERE (leave_type_id = $type OR leave_type_id IS NULL)
--      AND $days BETWEEN min_days AND max_days
--    ORDER BY step_no
--
-- Policy:
--   short leave (up to 2 days)  -> HR only            (1 step)
--   longer leave (over 2 days)  -> HR, then ADMIN     (2 steps)
--
-- leave_type_id IS NULL means "applies to every leave type".
--
-- The bands are 0..2 and 2.01..999 rather than 0..2 and 3..999 because day_count is
-- NUMERIC(5,2): a half-day request is 0.50 and a 2.5-day request is legal. 2.01 is the
-- next representable value after 2.00, so the two bands tile the whole range with no
-- gap. A day_count that matched no rule would produce a request with zero approval
-- steps, which could never be decided.
--
-- ON CONFLICT cannot carry the idempotency here: the UNIQUE is
-- (leave_type_id, min_days, max_days, step_no) and leave_type_id is NULL on every row.
-- NULLs are distinct in a unique index, so re-running would insert duplicates.
-- NOT EXISTS is matched against the same NULL-safe predicate instead.
-- ---------------------------------------------------------------------------
INSERT INTO approval_chain_rules (leave_type_id, min_days, max_days, step_no, approver_role)
SELECT v.leave_type_id, v.min_days, v.max_days, v.step_no, v.approver_role
FROM (VALUES
  (NULL::BIGINT, 0::NUMERIC(5,2),    2::NUMERIC(5,2),   1::SMALLINT, 'HR'::user_role),
  (NULL::BIGINT, 2.01::NUMERIC(5,2), 999::NUMERIC(5,2), 1::SMALLINT, 'HR'::user_role),
  (NULL::BIGINT, 2.01::NUMERIC(5,2), 999::NUMERIC(5,2), 2::SMALLINT, 'ADMIN'::user_role)
) AS v (leave_type_id, min_days, max_days, step_no, approver_role)
WHERE NOT EXISTS (
  SELECT 1 FROM approval_chain_rules r
  WHERE r.leave_type_id IS NOT DISTINCT FROM v.leave_type_id
    AND r.min_days = v.min_days
    AND r.max_days = v.max_days
    AND r.step_no  = v.step_no
);

COMMIT;
