# Dayflow HRMS

**Dayflow treats leave and attendance as immutable event ledgers with a database-driven
approval engine, so every balance in the system is auditable, reversible, and impossible
to silently corrupt.**

Every design decision below serves that sentence.

An employee's leave balance is not a number someone stored. It is `SUM(delta)` over an
append-only ledger, and the tape that produces it can be read back entry by entry. Cancel
an approved leave and the system does not edit history — it writes a compensating entry,
and both rows stay. Ask why a five-day request needed two approvals and the answer is a
row in a table, not a branch in a service.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL 16 (Docker) | Ledger constraints, `daterange` + GIST exclusion, window functions |
| Backend | Node 20 + Express 4 | Fast to write, transparent |
| DB driver | `pg`, raw parameterised SQL | The schema stays visible; no ORM hides it |
| Validation | `zod` | One source for every input rule |
| Auth | JWT in an httpOnly, SameSite=Lax cookie | XSS-safe; never in `localStorage` |
| Passwords | `bcrypt`, cost 10 | — |
| Uploads | `multer` → local disk | Local-first, no cloud |
| Realtime | Server-Sent Events | One-way push is all this needs; far less risk than WebSockets |

Runtime dependencies, in full: `pg`, `express`, `zod`, `bcrypt`, `jsonwebtoken`,
`multer`, `helmet`, `cors`. Nothing else. `helmet` and `cors` are the two additions
beyond the project's baseline allowlist, both required by the security checklist.

Requires **Node ≥ 20.12** (for the built-in `.env` reader — that is why there is no
`dotenv` dependency) and Docker.

---

## Setup

```bash
cp .env.example .env          # then set JWT_SECRET to something ≥32 chars
npm install

npm run db:up                 # postgres:16 only; the app itself is never dockerised
npm run migrate               # 7 migrations, tracked and re-runnable
npm run seed                  # reference data + 12 demo employees
npm run dev                   # http://localhost:4000
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

To start over at any point:

```bash
npm run db:reset && npm run migrate && npm run seed
```

Other scripts: `npm test` (6 tests against the real database), `npm start`,
`npm run db:down`, `node scripts/generate-seed.js` (regenerates `db/seed/02_demo_data.sql`).

### Verifying the install

`npm run migrate` is safe to run twice — the second run reports every migration as
`skip`. `npm run seed` is not: running it again raises

```
Demo data is already present. Start from a clean database.
```

That is deliberate. Silently skipping would be worse, because the ledger is append-only
and a second run would double every opening balance.

---

## Demo accounts

Every seeded account signs in with:

```
Dayflow@2026
```

All are `ACTIVE` with `email_verified_at` set, so no verification step is needed.

| Email | Role | Use it to demo |
|---|---|---|
| `meera.nair@dayflow.example` | ADMIN | Admin dashboard, payroll runs, salary revisions |
| `arjun.rao@dayflow.example` | ADMIN | Second approver — step 2 of a two-step chain |
| `nita.sharma@dayflow.example` | HR | Approval queue, step 1 |
| `priya.menon@dayflow.example` | EMPLOYEE | The Republic Day leave; payslips; ledger tape |
| `imran.sheikh@dayflow.example` | EMPLOYEE | **Insufficient balance** — 1.50 paid days left |

Eight more employees exist across Engineering, Finance, Design and People Operations —
twelve in total, each with a department, ~8 months of attendance, and a salary structure.

Two ADMIN accounts is not decoration. A single person may not sign off two steps of the
same request, so clearing a two-step chain genuinely needs two people.

### Two demos worth setting up deliberately

**A weekday public holiday is excluded from the leave count.** Priya's approved request
runs 23–28 January. Six calendar days, but it costs **three** leave days:

```
2026-01-23 Fri  ON_LEAVE
2026-01-24 Sat  WEEKEND
2026-01-25 Sun  WEEKEND
2026-01-26 Mon  HOLIDAY     <- Republic Day, not deducted
2026-01-27 Tue  ON_LEAVE
2026-01-28 Wed  ON_LEAVE
```

**Insufficient balance, computed rather than asserted.** Imran's paid-leave tape:

```
OPENING   +3.00   running 3.00
CONSUMED  -3.00   running 0.00
ACCRUAL   +1.50   running 1.50
```

Ask for three days and the API answers:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE",
             "message": "You have 1.50 paid leave days available but requested 3.",
             "details": [{ "field": "endDate", "issue": "Reduce the range by 1.50 days" }] } }
```

There is no balance column anywhere. That 1.50 is the sum of three rows.

---

## Schema

![Dayflow HRMS entity relationship diagram](docs/schema-diagram.png)

Nineteen tables and 27 foreign keys. The source is [docs/schema.mmd](docs/schema.mmd), a
Mermaid `erDiagram` written from `db/migrations/001..007` and then cross-checked against
`information_schema` and `pg_constraint` in a live database — every column and every
relationship in it is one the schema actually has, and none is missing.

`leave_balance_ledger` sits at the centre deliberately. Nothing anywhere stores a balance,
so the only route from "how much leave does this person have left" to an answer runs
through that table and the `v_leave_balances` view over it.

Three shapes in the diagram are worth pausing on:

- **`leave_balance_ledger.ref_request_id` is nullable.** An `OPENING` or `ACCRUAL` row
  belongs to no request; only `CONSUMED` and `REVERSAL` rows point back at one. That is why
  the relationship reads zero-or-one rather than exactly-one.
- **`attendance_days` has a composite primary key** — `(employee_id, work_date)`, with no
  surrogate id. It is derived state: one row per person per day, rebuilt from the punch
  tape rather than accumulated, so the natural key is the whole identity.
- **`approval_chain_rules.leave_type_id` is nullable**, and `NULL` means "applies to every
  leave type". Those are the rows the routing lookup matches by default.

The two views, `v_leave_balances` and `v_pending_approvals`, are not drawn — an ER diagram
shows tables, and both are defined in `db/migrations/007_views_and_indexes.sql`.

Regenerate the image after changing the schema:

```bash
npx @mermaid-js/mermaid-cli -i docs/schema.mmd -o docs/schema-diagram.png -b white -w 3600 -s 2
```

---

## Architecture decisions worth defending

### The ledger is append-only, and balances are never stored

`leave_balance_ledger` is only ever inserted into. There is no `UPDATE`, no `DELETE`, and
no balance column in any table. A balance is read through one view:

```sql
CREATE VIEW v_leave_balances AS
SELECT ..., COALESCE(SUM(l.delta), 0) AS balance
FROM employees e CROSS JOIN leave_types lt
LEFT JOIN leave_balance_ledger l ON l.employee_id = e.id AND l.leave_type_id = lt.id
```

Cancelling an approved leave inserts `delta = +day_count, reason = 'REVERSAL'`. The
original `CONSUMED` row stays. The tape reads:

```
OPENING +12.00 → CONSUMED -3.00 → REVERSAL +3.00     balance 12.00
```

The balance returns to where it started and the history explains why. A stored column
updated in place would give the same number and no account of it — and the first bug that
wrote it twice would be undetectable.

This is not free, and the cost is visible in the query plans below: reading a balance
means scanning that employee's ledger rows. `idx_ledger_balance_lookup` is what keeps it
affordable, and it is the difference between 10.3 ms and 0.9 ms.

### Approval routing lives in the database

There is no `if (days > 5)` anywhere in the codebase. The chain is a table:

```sql
SELECT * FROM approval_chain_rules
 WHERE (leave_type_id = $1 OR leave_type_id IS NULL)
   AND $2 BETWEEN min_days AND max_days
 ORDER BY step_no
```

Seeded policy: up to 2 days routes to HR alone; more than 2 days routes HR **then** ADMIN.
Adding a third approval level is an `INSERT`, not a deployment.

The bands are `0–2` and `2.01–999` rather than `1–2` and `3–999`, because `day_count` is
`NUMERIC(5,2)`. With `3` as the lower bound a 2.5-day request would match no rule and
produce a request with zero approval steps — permanently undecidable. All 99,900
representable values from 0.01 to 999 were checked against the seeded rules; none is
unroutable.

### The database refuses corrupt states, rather than trusting the code to avoid them

Three constraints do work that application logic would otherwise have to get right every
time:

```sql
-- no employee can hold two live requests over the same dates
CONSTRAINT no_overlapping_live_leave EXCLUDE USING gist (
  employee_id WITH =, period WITH &&
) WHERE (status IN ('PENDING','APPROVED'))

-- no employee can have two salary structures active on the same day
CONSTRAINT no_overlapping_salary EXCLUDE USING gist (
  employee_id WITH =, validity WITH &&
)

-- a ledger entry that moves nothing is meaningless
CHECK (delta <> 0)
```

The overlap check is not performed in JavaScript at all. `POST /leave/requests` inserts and
lets Postgres decide; `23P01` becomes `409 LEAVE_DATES_OVERLAP`. Two requests racing each
other cannot both win, because the winner is chosen by an index, not by a read-then-write.

Deleting is blocked the same way. `DELETE FROM users` fails outright: the approval steps
they decided and the ledger rows recording their leave both reference them, and neither
FK cascades. History cannot be removed by deleting the person it is about — the
append-only rule is enforced by the FK graph, not by convention.

### Concurrent approvals are serialised by the database

Two approvers clicking the same button at the same instant is the case that quietly
corrupts a balance. The decision path locks the request row, then re-reads the step in a
**separate statement** so a decision committed while we were queued is visible rather than
hidden by a stale snapshot:

```js
await withTransaction(async (client) => {
  const request = await lockRequestByStepId(client, { stepId }); // FOR UPDATE OF r
  const step = await lockStep(client, { stepId });               // fresh snapshot
  ...
});
```

Over 20 rounds of two approvers racing the same step, the winner split 10/10, the loser
got `409 STEP_ALREADY_DECIDED` every time, and the balance was **never** consumed twice.

### Salary structures are versioned, never edited

Changing someone's pay closes the current version and opens a new one, in one transaction:

| effective_from | effective_to | ctc | validity |
|---|---|---|---|
| 2025-02-10 | 2026-04-01 | 1,600,000 | `[2025-02-10,2026-04-01)` |
| 2026-04-01 | *(open)* | 1,800,000 | `[2026-04-01,)` |

Half-open ranges make consecutive versions adjacent rather than overlapping, so the
exclusion constraint is satisfied by construction. A payslip references the version it was
computed from, so reprinting last year's payslip after a raise still prints last year's
numbers.

### Attendance is derived, never entered

`deriveDay()` is a pure function of `(punches, approved leave, holiday calendar)` with no
clock and no database access. `attendance_days` is derived state that
`POST /attendance/recompute` rebuilds from the punch tape at any time. Re-deriving all
**2,776** seeded rows changes **zero** of them.

Punches are append-only and stamped with server time; there is no timestamp field in the
punch request for a client to send.

### Money never touches a float

Every monetary and leave-day column is `NUMERIC`. Pro-rating, summing and rounding all
happen in Postgres; the one place JavaScript computes money — deriving a default salary
breakdown — uses exact integer paise in `BigInt`. Rounding is applied **per line item**, so
a payslip's lines always sum to the totals they explain. Across the seeded payslips, the
number that fail to reconcile is 0.

`pg` returns `NUMERIC` and `BIGINT` as strings and the code leaves them that way. See
[docs/api-shapes.md](docs/api-shapes.md) — that is the first thing to know before writing
a client.

---

## Performance

The attendance-rate KPI, measured with and without `attendance_days (work_date, status)`.
The "without" plan was taken by dropping the index inside a transaction that was then
rolled back, so the schema still matches its migrations.

```sql
SELECT d.name,
       ROUND(100.0 * COUNT(*) FILTER (WHERE ad.status='PRESENT')
             / NULLIF(COUNT(*) FILTER (WHERE ad.status NOT IN ('WEEKEND','HOLIDAY')),0), 1) AS attendance_pct
FROM attendance_days ad
JOIN employees e ON e.id = ad.employee_id
JOIN departments d ON d.id = e.department_id
WHERE ad.work_date >= CURRENT_DATE - 30
GROUP BY d.name ORDER BY attendance_pct;
```

Measured at 368,276 rows — the demo dataset is 2,776 rows in 384 kB, small enough that a
sequential scan is a handful of pages and any measurement on it alone would be close to
noise. Both scales are reported in [docs/performance.md](docs/performance.md).

### WITH the index

```
 Sort  (cost=3585.81..3586.31 rows=200 width=64) (actual time=12.995..13.001 rows=4 loops=1)
   Sort Key: (round(((100.0 * (count(*) FILTER (WHERE (ad.status = 'PRESENT'::day_status)))::numeric) / (NULLIF(count(*) FILTER (WHERE (ad.status <> ALL ('{WEEKEND,HOLIDAY}'::day_status[]))), 0))::numeric), 1))
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=173
   ->  HashAggregate  (cost=3573.16..3578.16 rows=200 width=64) (actual time=12.975..12.983 rows=4 loops=1)
         Group Key: d.name
         Batches: 1  Memory Usage: 40kB
         Buffers: shared hit=170
         ->  Hash Join  (cost=274.93..3365.49 rows=16614 width=36) (actual time=0.499..8.246 rows=15872 loops=1)
               Hash Cond: (e.department_id = d.id)
               Buffers: shared hit=170
               ->  Hash Join  (cost=246.71..3293.42 rows=16614 width=12) (actual time=0.484..5.601 rows=15872 loops=1)
                     Hash Cond: (ad.employee_id = e.id)
                     Buffers: shared hit=169
                     ->  Bitmap Heap Scan on attendance_days ad  (cost=229.19..3231.93 rows=16614 width=12) (actual time=0.350..1.952 rows=15872 loops=1)
                           Recheck Cond: (work_date >= (CURRENT_DATE - 30))
                           Heap Blocks: exact=138
                           Buffers: shared hit=163
                           ->  Bitmap Index Scan on attendance_days_work_date_status_idx  (cost=0.00..225.03 rows=16614 width=0) (actual time=0.328..0.328 rows=15872 loops=1)
                                 Index Cond: (work_date >= (CURRENT_DATE - 30))
                                 Buffers: shared hit=25
                     ->  Hash  (cost=11.12..11.12 rows=512 width=16) (actual time=0.129..0.130 rows=512 loops=1)
                           Buckets: 1024  Batches: 1  Memory Usage: 32kB
                           Buffers: shared hit=6
                           ->  Seq Scan on employees e  (cost=0.00..11.12 rows=512 width=16) (actual time=0.003..0.063 rows=512 loops=1)
                                 Buffers: shared hit=6
               ->  Hash  (cost=18.10..18.10 rows=810 width=40) (actual time=0.010..0.011 rows=4 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 9kB
                     Buffers: shared hit=1
                     ->  Seq Scan on departments d  (cost=0.00..18.10 rows=810 width=40) (actual time=0.005..0.006 rows=4 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=104
 Planning Time: 0.555 ms
 Execution Time: 13.056 ms
```

### WITHOUT the index

```
 Sort  (cost=7769.43..7769.93 rows=200 width=64) (actual time=26.808..31.036 rows=4 loops=1)
   Sort Key: (round(((100.0 * (count(*) FILTER (WHERE (ad.status = 'PRESENT'::day_status)))::numeric) / (NULLIF(count(*) FILTER (WHERE (ad.status <> ALL ('{WEEKEND,HOLIDAY}'::day_status[]))), 0))::numeric), 1))
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=2751
   ->  Finalize GroupAggregate  (cost=7732.29..7761.79 rows=200 width=64) (actual time=26.796..31.028 rows=4 loops=1)
         Group Key: d.name
         Buffers: shared hit=2751
         ->  Gather Merge  (cost=7732.29..7755.29 rows=200 width=48) (actual time=26.783..31.010 rows=8 loops=1)
               Workers Planned: 1
               Workers Launched: 1
               Buffers: shared hit=2751
               ->  Sort  (cost=6732.28..6732.78 rows=200 width=48) (actual time=23.641..23.645 rows=4 loops=2)
                     Sort Key: d.name
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=2751
                     Worker 0:  Sort Method: quicksort  Memory: 25kB
                     ->  Partial HashAggregate  (cost=6722.64..6724.64 rows=200 width=48) (actual time=23.612..23.617 rows=4 loops=2)
                           Group Key: d.name
                           Batches: 1  Memory Usage: 40kB
                           Buffers: shared hit=2742
                           Worker 0:  Batches: 1  Memory Usage: 40kB
                           ->  Hash Join  (cost=45.75..6600.47 rows=9773 width=36) (actual time=7.282..21.601 rows=7936 loops=2)
                                 Hash Cond: (e.department_id = d.id)
                                 Buffers: shared hit=2742
                                 ->  Hash Join  (cost=17.52..6546.46 rows=9773 width=12) (actual time=7.252..20.206 rows=7936 loops=2)
                                       Hash Cond: (ad.employee_id = e.id)
                                       Buffers: shared hit=2740
                                       ->  Parallel Seq Scan on attendance_days ad  (cost=0.00..6503.08 rows=9773 width=12) (actual time=7.017..18.249 rows=7936 loops=2)
                                             Filter: (work_date >= (CURRENT_DATE - 30))
                                             Rows Removed by Filter: 176202
                                             Buffers: shared hit=2712
                                       ->  Hash  (cost=11.12..11.12 rows=512 width=16) (actual time=0.181..0.182 rows=512 loops=2)
                                             Buckets: 1024  Batches: 1  Memory Usage: 32kB
                                             Buffers: shared hit=12
                                             ->  Seq Scan on employees e  (cost=0.00..11.12 rows=512 width=16) (actual time=0.029..0.103 rows=512 loops=2)
                                                   Buffers: shared hit=12
                                 ->  Hash  (cost=18.10..18.10 rows=810 width=40) (actual time=0.019..0.020 rows=4 loops=2)
                                       Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                       Buffers: shared hit=2
                                       ->  Seq Scan on departments d  (cost=0.00..18.10 rows=810 width=40) (actual time=0.010..0.011 rows=4 loops=2)
                                             Buffers: shared hit=2
 Planning:
   Buffers: shared hit=22
 Planning Time: 0.383 ms
 Execution Time: 31.233 ms
```

**31.233 ms → 13.056 ms, and 2,751 shared buffers → 173.**

The buffer count is the real story. Without the index Postgres gives up on a plain scan
and recruits a parallel worker, and the two processes still discard 176,202 rows apiece by
filter. With it, one Bitmap Index Scan locates the 15,872 matching rows in 0.328 ms. The
index is not making a slow query fast so much as turning a query that reads the *whole
table* into one that reads *the part it needs*.

The same comparison for `idx_ledger_balance_lookup` — the index that makes computing
balances from history practical — is in [docs/performance.md](docs/performance.md):
**10.322 ms → 0.869 ms**, with `Rows Removed by Filter: 135704` disappearing entirely.

---

## API

Base `/api`. Auth is an httpOnly cookie, so clients must send `credentials: 'include'`.

| Module | Endpoints |
|---|---|
| `/auth` | `register`, `verify`, `login`, `logout`, `me` |
| `/leave` | `types`, `balances`, `ledger`, `requests` (list/create/detail/cancel) |
| `/approvals` | `queue`, `steps/:id/decide` |
| `/attendance` | `punch`, `me`, `today`, `recompute`, list |
| `/payroll` | `me`, `employees/:id`, `employees/:id/structure`, `runs`, `payslips/:id` |
| `/employees` | list, detail, `PATCH`, `photo`, `documents` |
| `/documents` | `:id/download` |
| `/dashboard` | `employee`, `admin` |
| `/notifications` | list, `:id/read` |
| `/stream` | SSE: `approval:new`, `approval:decided`, `attendance:punch` |

Every error in the system uses one envelope:

```json
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "...", "details": [{ "field": "...", "issue": "..." }] } }
```

`details` is **absent**, not `[]`, when there is nothing to say.

**[docs/api-shapes.md](docs/api-shapes.md)** has the real response body for every endpoint
above, captured from the running server against this seed — not hand-written examples.

---

## Tests

```bash
npm test
```

Six tests, run against the real database rather than a mock, because the properties worth
testing here are enforced by Postgres:

1. Balance equals `SUM(delta)` after accrual → consume → reverse
2. Approving the final step inserts exactly one `CONSUMED` row
3. Rejecting inserts **zero** ledger rows
4. An overlapping request raises `23P01` and maps to `409`
5. Two concurrent decides on one step: one wins, one gets `409`
6. IN 09:00 / OUT 13:00 derives `HALF_DAY`, 240 minutes

Test 5 is the one to watch. The suite appends to the database by design — the ledger is
append-only and the concurrency test needs genuinely committed transactions — so reset
before demoing.

---

## Known limitations

- **HR cannot open an individual payslip.** `GET /payroll/payslips/:id` is scoped to owner
  or ADMIN, exactly as the API contract specifies. HR can read the same figures through
  `GET /payroll/employees/:id`, so this is an inconsistency in the contract rather than a
  data leak — left as written because the frontend is built against it.
- **No email is sent.** Mail transport is out of scope, so outside production
  `POST /auth/register` returns the verification link in the response body and logs it.
  Production discloses neither.
- **`requireAuth` is stateless.** A role change or a disabled account takes effect on the
  user's next login, within the 8-hour token lifetime.
- **The login rate limit is per-email and in-memory.** It protects an account from being
  ground down; it does not stop a spray across many addresses from one host, and counters
  reset when the process restarts.
- **Notifications are stored, not pushed to offline users.** SSE reaches connected clients
  only; anyone offline sees them on next load.
- **Attendance KPI 1 excludes employees with no department**, because it inner-joins
  departments. Every seeded employee has one.
- **The seed is a snapshot.** Regenerating with `node scripts/generate-seed.js` re-dates it
  relative to the day it runs.

---

## Repository layout

```
db/migrations/     7 SQL migrations, applied in order and tracked
db/seed/           01 reference data, 02 generated demo data
db/run-migrations.js, db/run-seed.js
scripts/           generate-seed.js
server/src/
  config/env.js    zod-validated process.env, throws on startup
  db/pool.js       the one pg Pool, plus withTransaction()
  middleware/      auth, validate, errorHandler, rateLimit, upload, audit
  modules/         auth, leave, approvals, attendance, payroll,
                   employees, dashboard, notifications
  realtime/sse.js
server/tests/
docs/              api-shapes.md, performance.md
```

Every module has exactly four files: `.routes.js` wires, `.schema.js` validates,
`.service.js` decides, `.queries.js` holds the SQL. A route containing SQL is a bug; a
service touching `req` is a bug.
