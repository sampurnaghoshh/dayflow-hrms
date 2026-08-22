-- 007_views_and_indexes.sql
-- The ONLY way balances are ever read.
CREATE VIEW v_leave_balances AS
SELECT e.id                AS employee_id,
       lt.id               AS leave_type_id,
       lt.code             AS leave_code,
       lt.name             AS leave_name,
       COALESCE(SUM(l.delta), 0) AS balance,
       COALESCE(SUM(l.delta) FILTER (WHERE l.reason = 'ACCRUAL'), 0) AS total_accrued,
       COALESCE(-SUM(l.delta) FILTER (WHERE l.reason = 'CONSUMED'), 0) AS total_consumed
FROM employees e
CROSS JOIN leave_types lt
LEFT JOIN leave_balance_ledger l
       ON l.employee_id = e.id AND l.leave_type_id = lt.id
WHERE lt.is_active
GROUP BY e.id, lt.id;

-- Pending work queue, used by the approvals module and the admin dashboard.
CREATE VIEW v_pending_approvals AS
SELECT s.id AS step_id, s.request_id, s.step_no, s.approver_role,
       r.employee_id, e.full_name, e.department_id,
       lt.code AS leave_code, r.start_date, r.end_date, r.day_count, r.remarks, r.created_at
FROM approval_steps s
JOIN leave_requests r ON r.id = s.request_id AND r.current_step = s.step_no
JOIN employees e      ON e.id = r.employee_id
JOIN leave_types lt   ON lt.id = r.leave_type_id
WHERE s.status = 'PENDING' AND r.status = 'PENDING';
