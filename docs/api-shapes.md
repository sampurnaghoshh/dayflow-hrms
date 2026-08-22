# API response shapes

Captured from the running server on 2026-08-22 against the committed demo seed
(`npm run db:reset && npm run migrate && npm run seed`), not written by hand. Every block below is
the actual body returned by `node server/src/index.js` against a seeded database,
pretty-printed for readability (the wire format is minified).

Regenerate by re-running the requests shown against a fresh `npm run db:reset && npm run
migrate && npm run seed`.

## Types that will bite a mock

- **All ids are strings, not numbers** — `"id": "1"`. They are `BIGINT` columns and
  `pg` returns them as strings so values past 2^53 stay exact.
- **All money and leave-day figures are strings** — `"7.50"`, `"86956.52"`. They are
  `NUMERIC` and are never parsed into a float anywhere in the stack.
- **Dates and timestamps are different types.** `start_date`, `work_date`,
  `date_of_joining`, `period_month` are bare `'YYYY-MM-DD'` calendar days. `created_at`,
  `punch_at`, `acted_at` are full ISO instants. Do not run a calendar day through
  `new Date()` and reformat it — it shifts by a day outside UTC.
- **`error.details` is absent, not `[]`, when there is nothing to say.** Check
  `error.details?.length`.
- Every error in the system uses the one envelope: `{ "error": { "code", "message", "details?" } }`.

## POST /api/auth/login

**200** — The session arrives as an httpOnly `Set-Cookie`, not in the body. A 200 here means signed in.

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "riya@example.com", "password": "Passw0rdSafe" }
```

```json
{
  "user": {
    "id": "5",
    "employeeCode": "DF-005",
    "email": "priya.menon@dayflow.example",
    "role": "EMPLOYEE",
    "status": "ACTIVE",
    "employeeId": "5"
  }
}
```

## GET /api/auth/me

**200** — `employee` and `employee.department` are both nullable. Note the shape differs from `login`: this one is nested.

```json
{
  "user": {
    "id": "5",
    "employeeCode": "DF-005",
    "email": "priya.menon@dayflow.example",
    "role": "EMPLOYEE",
    "status": "ACTIVE",
    "emailVerifiedAt": "2025-02-10T04:00:00.000Z",
    "lastLoginAt": "2026-08-22T07:18:28.063Z"
  },
  "employee": {
    "id": "5",
    "fullName": "Priya Menon",
    "designation": "Senior Engineer",
    "dateOfJoining": "2025-02-10",
    "phone": "+91 986912726",
    "address": "77 Residency Road, Bengaluru",
    "profilePhotoPath": null,
    "managerId": "4",
    "department": {
      "id": "1",
      "code": "ENG",
      "name": "Engineering"
    }
  }
}
```

## GET /api/leave/types

**200** — `annual_cap` is `null` for UNPAID.

```json
[
  {
    "id": "1",
    "code": "PAID",
    "name": "Paid Leave",
    "is_paid": true,
    "accrual_per_month": "1.50",
    "annual_cap": "18.00",
    "carry_forward_cap": "6.00",
    "requires_document": false
  },
  {
    "id": "2",
    "code": "SICK",
    "name": "Sick Leave",
    "is_paid": true,
    "accrual_per_month": "0.50",
    "annual_cap": "6.00",
    "carry_forward_cap": "0.00",
    "requires_document": false
  },
  {
    "id": "3",
    "code": "UNPAID",
    "name": "Unpaid Leave",
    "is_paid": false,
    "accrual_per_month": "0.00",
    "annual_cap": null,
    "carry_forward_cap": "0.00",
    "requires_document": false
  }
]
```

## GET /api/leave/balances

**200** — Every active leave type appears, including ones with no ledger rows — UNPAID reads `"0.00"`, never `"0"` or missing. Accepts `?employeeId=` for HR/ADMIN.

```json
{
  "employeeId": "5",
  "balances": [
    {
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "balance": "12.00",
      "total_accrued": "0.00",
      "total_consumed": "6.00"
    },
    {
      "leave_type_id": "2",
      "leave_code": "SICK",
      "leave_name": "Sick Leave",
      "balance": "6.00",
      "total_accrued": "0.00",
      "total_consumed": "0.00"
    },
    {
      "leave_type_id": "3",
      "leave_code": "UNPAID",
      "leave_name": "Unpaid Leave",
      "balance": "0.00",
      "total_accrued": "0.00",
      "total_consumed": "0.00"
    }
  ]
}
```

## POST /api/leave/requests

**201** — `dayCount` excludes weekends and public holidays. `approvalSteps` comes from `approval_chain_rules`: up to 2 days is HR alone, over 2 days is HR then ADMIN.

```http
POST /api/leave/requests
Content-Type: application/json

{ "leaveTypeId": 1, "startDate": "2026-09-07", "endDate": "2026-09-09", "remarks": "Family function" }
```

```json
{
  "request": {
    "id": "30",
    "employee_id": "5",
    "leave_type_id": "1",
    "start_date": "2026-11-16",
    "end_date": "2026-11-18",
    "day_count": "3.00",
    "remarks": "Family function",
    "status": "PENDING",
    "current_step": 1,
    "created_at": "2026-08-22T07:18:29.246Z",
    "decided_at": null
  },
  "approvalSteps": [
    {
      "id": "47",
      "step_no": 1,
      "approver_role": "HR",
      "status": "PENDING"
    },
    {
      "id": "48",
      "step_no": 2,
      "approver_role": "ADMIN",
      "status": "PENDING"
    }
  ],
  "dayCount": 3
}
```

## GET /api/leave/requests

**200** — The list envelope from §6. `?scope=all` is honoured for HR/ADMIN and silently downgraded to your own list for anyone else. Also accepts `?status=`, `?employeeId=`, `?page=`, `?pageSize=`.

```json
{
  "data": [
    {
      "id": "7",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "start_date": "2026-09-21",
      "end_date": "2026-09-22",
      "day_count": "2.00",
      "remarks": "Not well",
      "status": "PENDING",
      "current_step": 1,
      "created_at": "2026-09-09T06:15:00.000Z",
      "decided_at": null
    },
    {
      "id": "30",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "start_date": "2026-11-16",
      "end_date": "2026-11-18",
      "day_count": "3.00",
      "remarks": "Family function",
      "status": "PENDING",
      "current_step": 1,
      "created_at": "2026-08-22T07:18:29.246Z",
      "decided_at": null
    },
    {
      "id": "6",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "start_date": "2026-06-15",
      "end_date": "2026-06-17",
      "day_count": "3.00",
      "remarks": "Medical appointment",
      "status": "APPROVED",
      "current_step": 2,
      "created_at": "2026-06-03T06:15:00.000Z",
      "decided_at": "2026-06-11T05:10:00.000Z"
    },
    {
      "id": "5",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "start_date": "2026-04-06",
      "end_date": "2026-04-08",
      "day_count": "3.00",
      "remarks": "Short-notice trip",
      "status": "REJECTED",
      "current_step": 2,
      "created_at": "2026-03-25T06:15:00.000Z",
      "decided_at": "2026-04-02T05:10:00.000Z"
    },
    {
      "id": "1",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "leave_type_id": "1",
      "leave_code": "PAID",
      "leave_name": "Paid Leave",
      "start_date": "2026-01-23",
      "end_date": "2026-01-28",
      "day_count": "3.00",
      "remarks": "Republic Day long weekend - visiting family",
      "status": "APPROVED",
      "current_step": 2,
      "created_at": "2026-01-09T06:15:00.000Z",
      "decided_at": "2026-01-19T05:10:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 5
}
```

## GET /api/leave/requests/:id

**200** — `timeline` has one row per approval step. `approver_name` and `acted_at` are `null` until that step is decided.

```json
{
  "request": {
    "id": "30",
    "employee_id": "5",
    "full_name": "Priya Menon",
    "department_id": "1",
    "leave_type_id": "1",
    "leave_code": "PAID",
    "leave_name": "Paid Leave",
    "is_paid": true,
    "start_date": "2026-11-16",
    "end_date": "2026-11-18",
    "day_count": "3.00",
    "remarks": "Family function",
    "status": "PENDING",
    "current_step": 1,
    "created_at": "2026-08-22T07:18:29.246Z",
    "decided_at": null
  },
  "timeline": [
    {
      "step_id": "47",
      "step_no": 1,
      "approver_role": "HR",
      "status": "PENDING",
      "comment": null,
      "acted_at": null,
      "approver_user_id": null,
      "approver_name": null
    },
    {
      "step_id": "48",
      "step_no": 2,
      "approver_role": "ADMIN",
      "status": "PENDING",
      "comment": null,
      "acted_at": null,
      "approver_user_id": null,
      "approver_name": null
    }
  ]
}
```

## GET /api/approvals/queue

**200** — HR/ADMIN only. Shows only steps the caller could actually decide, and never their own requests.

```json
{
  "data": [
    {
      "step_id": "37",
      "request_id": "24",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "12",
      "full_name": "Farhan Qureshi",
      "department_id": "2",
      "leave_code": "PAID",
      "start_date": "2026-09-01",
      "end_date": "2026-09-02",
      "day_count": "2.00",
      "remarks": "Moving house",
      "created_at": "2026-08-20T06:15:00.000Z"
    },
    {
      "step_id": "47",
      "request_id": "30",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "department_id": "1",
      "leave_code": "PAID",
      "start_date": "2026-11-16",
      "end_date": "2026-11-18",
      "day_count": "3.00",
      "remarks": "Family function",
      "created_at": "2026-08-22T07:18:29.246Z"
    },
    {
      "step_id": "28",
      "request_id": "18",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "9",
      "full_name": "Kavita Reddy",
      "department_id": "3",
      "leave_code": "PAID",
      "start_date": "2026-09-07",
      "end_date": "2026-09-11",
      "day_count": "5.00",
      "remarks": "Wedding season",
      "created_at": "2026-08-26T06:15:00.000Z"
    },
    {
      "step_id": "7",
      "request_id": "4",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "4",
      "full_name": "Vikram Desai",
      "department_id": "1",
      "leave_code": "PAID",
      "start_date": "2026-09-14",
      "end_date": "2026-09-16",
      "day_count": "3.00",
      "remarks": "Sabbatical planning",
      "created_at": "2026-09-02T06:15:00.000Z"
    },
    {
      "step_id": "13",
      "request_id": "7",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "5",
      "full_name": "Priya Menon",
      "department_id": "1",
      "leave_code": "PAID",
      "start_date": "2026-09-21",
      "end_date": "2026-09-22",
      "day_count": "2.00",
      "remarks": "Not well",
      "created_at": "2026-09-09T06:15:00.000Z"
    },
    {
      "step_id": "18",
      "request_id": "10",
      "step_no": 1,
      "approver_role": "HR",
      "employee_id": "6",
      "full_name": "Rahul Iyer",
      "department_id": "1",
      "leave_code": "PAID",
      "start_date": "2026-09-28",
      "end_date": "2026-09-29",
      "day_count": "2.00",
      "remarks": "Moving house",
      "created_at": "2026-09-16T06:15:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 6
}
```

## POST /api/approvals/steps/:stepId/decide

**200** — This is a non-final step, so `ledgerEntry` is `null` and `request.current_step` advanced to 2. Approving the FINAL step instead returns `ledgerEntry` with the single `CONSUMED` row and `request.status: "APPROVED"`. Rejecting returns `ledgerEntry: null` and `skippedSteps` greater than 0.

```http
POST /api/approvals/steps/1/decide
Content-Type: application/json

{ "action": "APPROVE", "comment": "Approved, enjoy" }
```

```json
{
  "step": {
    "id": "47",
    "step_no": 1,
    "status": "APPROVED",
    "approver_user_id": "3",
    "comment": "Approved, enjoy",
    "acted_at": "2026-08-22T07:18:30.090Z"
  },
  "requestId": "30",
  "ledgerEntry": null,
  "attendanceDays": 0,
  "skippedSteps": 0,
  "request": {
    "id": "30",
    "status": "PENDING",
    "current_step": 2
  },
  "employeeUserId": "5",
  "leaveCode": "PAID"
}
```

## GET /api/payroll/me

**200** — Read-only. `current` is the open salary version (`effective_to: null`); `history` includes it plus every closed one.

```json
{
  "employeeId": "5",
  "current": {
    "id": "7",
    "employee_id": "5",
    "effective_from": "2026-04-01",
    "effective_to": null,
    "ctc_annual": "1800000.00",
    "created_at": "2026-04-01T03:30:00.000Z",
    "created_by_name": "Meera Nair",
    "components": [
      {
        "code": "PF",
        "label": "Provident Fund",
        "kind": "DEDUCTION",
        "monthlyAmount": "7200.00"
      },
      {
        "code": "PT",
        "label": "Professional Tax",
        "kind": "DEDUCTION",
        "monthlyAmount": "200.00"
      },
      {
        "code": "BASIC",
        "label": "Basic Salary",
        "kind": "EARNING",
        "monthlyAmount": "60000.00"
      },
      {
        "code": "HRA",
        "label": "House Rent Allowance",
        "kind": "EARNING",
        "monthlyAmount": "30000.00"
      },
      {
        "code": "SPECIAL",
        "label": "Special Allowance",
        "kind": "EARNING",
        "monthlyAmount": "60000.00"
      }
    ]
  },
  "history": [
    {
      "id": "7",
      "employee_id": "5",
      "effective_from": "2026-04-01",
      "effective_to": null,
      "ctc_annual": "1800000.00",
      "created_at": "2026-04-01T03:30:00.000Z",
      "created_by_name": "Meera Nair",
      "components": [
        {
          "code": "PF",
          "label": "Provident Fund",
          "kind": "DEDUCTION",
          "monthlyAmount": "7200.00"
        },
        {
          "code": "PT",
          "label": "Professional Tax",
          "kind": "DEDUCTION",
          "monthlyAmount": "200.00"
        },
        {
          "code": "BASIC",
          "label": "Basic Salary",
          "kind": "EARNING",
          "monthlyAmount": "60000.00"
        },
        {
          "code": "HRA",
          "label": "House Rent Allowance",
          "kind": "EARNING",
          "monthlyAmount": "30000.00"
        },
        {
          "code": "SPECIAL",
          "label": "Special Allowance",
          "kind": "EARNING",
          "monthlyAmount": "60000.00"
        }
      ]
    },
    {
      "id": "6",
      "employee_id": "5",
      "effective_from": "2025-02-10",
      "effective_to": "2026-04-01",
      "ctc_annual": "1600000.00",
      "created_at": "2025-02-10T03:30:00.000Z",
      "created_by_name": "Meera Nair",
      "components": [
        {
          "code": "PF",
          "label": "Provident Fund",
          "kind": "DEDUCTION",
          "monthlyAmount": "6399.99"
        },
        {
          "code": "PT",
          "label": "Professional Tax",
          "kind": "DEDUCTION",
          "monthlyAmount": "200.00"
        },
        {
          "code": "BASIC",
          "label": "Basic Salary",
          "kind": "EARNING",
          "monthlyAmount": "53333.33"
        },
        {
          "code": "HRA",
          "label": "House Rent Allowance",
          "kind": "EARNING",
          "monthlyAmount": "26666.66"
        },
        {
          "code": "SPECIAL",
          "label": "Special Allowance",
          "kind": "EARNING",
          "monthlyAmount": "53333.34"
        }
      ]
    }
  ],
  "payslips": [
    {
      "id": "29",
      "employee_id": "5",
      "period_month": "2026-08-01",
      "salary_version_id": "7",
      "payable_days": "21.00",
      "lop_days": "0.00",
      "gross_earnings": "150000.00",
      "total_deductions": "7400.00",
      "net_pay": "142600.00",
      "generated_at": "2026-08-22T07:17:05.053Z"
    },
    {
      "id": "17",
      "employee_id": "5",
      "period_month": "2026-07-01",
      "salary_version_id": "7",
      "payable_days": "21.00",
      "lop_days": "2.00",
      "gross_earnings": "136956.52",
      "total_deductions": "6756.52",
      "net_pay": "130200.00",
      "generated_at": "2026-07-01T12:30:00.000Z"
    },
    {
      "id": "5",
      "employee_id": "5",
      "period_month": "2026-06-01",
      "salary_version_id": "7",
      "payable_days": "22.00",
      "lop_days": "0.00",
      "gross_earnings": "150000.00",
      "total_deductions": "7400.00",
      "net_pay": "142600.00",
      "generated_at": "2026-06-01T12:30:00.000Z"
    }
  ]
}
```

## GET /api/attendance/me?from=&to=

**200** — Daily rows plus the weekly rollup. `week_start` is the Monday. Trimmed below to the first few days — the real response has one row per calendar day in range. Defaults to the current month when `from`/`to` are omitted.

```json
{
  "employeeId": "5",
  "from": "2026-08-01",
  "to": "2026-08-22",
  "days": [
    {
      "employee_id": "5",
      "work_date": "2026-08-01",
      "status": "WEEKEND",
      "worked_minutes": 0,
      "first_in": null,
      "last_out": null,
      "leave_request_id": null,
      "computed_at": "2026-08-22T07:17:03.798Z",
      "leave_code": null
    },
    {
      "employee_id": "5",
      "work_date": "2026-08-02",
      "status": "WEEKEND",
      "worked_minutes": 0,
      "first_in": null,
      "last_out": null,
      "leave_request_id": null,
      "computed_at": "2026-08-22T07:17:03.798Z",
      "leave_code": null
    },
    {
      "employee_id": "5",
      "work_date": "2026-08-03",
      "status": "PRESENT",
      "worked_minutes": 504,
      "first_in": "2026-08-03T04:14:00.000Z",
      "last_out": "2026-08-03T12:38:00.000Z",
      "leave_request_id": null,
      "computed_at": "2026-08-22T07:17:03.798Z",
      "leave_code": null
    },
    {
      "employee_id": "5",
      "work_date": "2026-08-04",
      "status": "PRESENT",
      "worked_minutes": 511,
      "first_in": "2026-08-04T04:07:00.000Z",
      "last_out": "2026-08-04T12:38:00.000Z",
      "leave_request_id": null,
      "computed_at": "2026-08-22T07:17:03.798Z",
      "leave_code": null
    },
    {
      "…": "18 more days omitted"
    }
  ],
  "weekly": [
    {
      "week_start": "2026-07-27",
      "worked_minutes": 0,
      "present_days": 0,
      "half_days": 0,
      "absent_days": 0,
      "leave_days": 0,
      "non_working_days": 2
    },
    {
      "week_start": "2026-08-03",
      "worked_minutes": 2581,
      "present_days": 5,
      "half_days": 0,
      "absent_days": 0,
      "leave_days": 0,
      "non_working_days": 2
    },
    {
      "week_start": "2026-08-10",
      "worked_minutes": 2560,
      "present_days": 5,
      "half_days": 0,
      "absent_days": 0,
      "leave_days": 0,
      "non_working_days": 2
    },
    {
      "week_start": "2026-08-17",
      "worked_minutes": 2616,
      "present_days": 5,
      "half_days": 0,
      "absent_days": 0,
      "leave_days": 0,
      "non_working_days": 1
    }
  ]
}
```

## Error bodies

### 409 STEP_ALREADY_DECIDED

Returned when a second approver acts on a step someone already decided. The message names the person who decided *that step*.

```json
{
  "error": {
    "code": "STEP_ALREADY_DECIDED",
    "message": "Nita Sharma already approved this step.",
    "details": [
      {
        "field": "stepId",
        "issue": "Nita Sharma approved it at 2026-08-22T07:18:30.090Z"
      }
    ]
  }
}
```

### 422 INSUFFICIENT_BALANCE

Raised before the request is written. `details[].field` points at the input to correct.

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "You have 1.50 paid leave days available but requested 3.",
    "details": [
      {
        "field": "endDate",
        "issue": "Reduce the range by 1.50 days"
      }
    ]
  }
}
```

## SSE events — GET /api/stream

The stream is behind `requireAuth`; open it with `new EventSource('/api/stream', { withCredentials: true })`.
A `: ping` comment arrives every 20s to keep the connection alive — ignore it.

### `connected`

Sent immediately on connect, so the client can tell "open" from "still connecting". Preceded by a `retry: 3000` line.

```json
{
  "userId": "1",
  "at": "2026-08-22T07:18:56.256Z"
}
```

### `attendance:punch`

Broadcast to every connected client after a punch commits.

```json
{
  "employeeId": "5",
  "direction": "IN",
  "punchAt": "2026-08-22T07:18:57.874Z",
  "workDate": "2026-08-22",
  "status": "WEEKEND",
  "workedMinutes": 0
}
```

### `approval:new`

Broadcast when a leave request is created. `approverRole` is the role that acts first.

```json
{
  "requestId": "31",
  "employeeId": "5",
  "leaveCode": "UNPAID",
  "startDate": "2026-12-07",
  "endDate": "2026-12-08",
  "dayCount": "2.00",
  "approverRole": "HR"
}
```

### `approval:decided`

`currentStep` is `null` once the request is terminal. `consumed` is `null` unless the final step just wrote a CONSUMED ledger row.

```json
{
  "requestId": "30",
  "stepNo": 2,
  "action": "APPROVE",
  "decidedBy": "1",
  "requestStatus": "APPROVED",
  "currentStep": null,
  "leaveCode": "PAID",
  "consumed": "-3.00"
}
```

## Known contract gap

`GET /api/payroll/payslips/:id` is **owner or ADMIN**, exactly as CLAUDE.md §6 specifies —
HR is deliberately *not* included, even though HR can read the same figures through
`GET /api/payroll/employees/:id`. An HR user opening a payslip gets `404 PAYSLIP_NOT_FOUND`.
Left as written so the frontend can build against §6; raise it if the UI needs HR access.
