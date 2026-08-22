# Dayflow HRMS — QA Checklist

> QA & Release checklist. Run the full sweep from 15:00 before the final demo.

## 1. Input Handling

| Status | Test | Expected Result |
|---|---|---|
| ⬜ | Register with an existing email | Inline field error, no crash |
| ⬜ | Password `abc` | Inline rule error before submit is possible |
| ⬜ | Sign in unverified | "Verify your email to sign in." |
| ⬜ | Leave end date before start date | Blocked with an inline message |
| ⬜ | Leave dates in the past | Blocked with an explanation |
| ⬜ | Leave spanning only a weekend | "That range has no working days." |
| ⬜ | Request more days than the balance | Blocked, shows exact available figure |
| ⬜ | Overlapping an existing request | 409 with the conflicting dates named |
| ⬜ | Remarks field with `<script>alert(1)</script>` | Stored and rendered as literal text |
| ⬜ | Remarks with 5,000 characters | Rejected with the limit stated |
| ⬜ | Emoji in name and remarks | Saves and displays correctly |
| ⬜ | Upload a `.exe` renamed to `.pdf` | Rejected on MIME check |
| ⬜ | Upload a 10 MB file | Rejected with the size stated |
| ⬜ | Double-click Apply | One request created, not two |
| ⬜ | Double-click check-in | One punch (idempotency key) |
| ⬜ | Check out with no check-in | Clear error |

## 2. Authorisation / Security

| Status | Test | Expected Result |
|---|---|---|
| ⬜ | Employee opens `/admin/employees` directly by URL | Redirected, not rendered |
| ⬜ | Employee calls `GET /api/employees` via curl with their own cookie | 403 |
| ⬜ | Employee calls `GET /api/employees/7` (not theirs) | 404, not 403 |
| ⬜ | Employee calls `POST /api/approvals/steps/1/decide` | 403 |
| ⬜ | Employee PATCHes their own `designation` or `ctc_annual` | Field ignored or 403 — never silently saved |
| ⬜ | Any API call with no cookie | 401 |
| ⬜ | Tampered JWT cookie | 401 |
| ⬜ | Download another employee's document by ID | 404 |
| ⬜ | 6 wrong logins in a row | Rate limited |

## 3. Concurrency Test

### Procedure

1. Open two browsers, both signed in as approvers.
2. Open the same leave request in both browsers.
3. Click **Approve** in both browsers within a second.
4. Verify that one succeeds.
5. Verify that the other displays: **"Priya already approved this request."**
6. Check the leave ledger.

### Expected Result

- [ ] Only one approval succeeds.
- [ ] The second approver receives the "already approved" message.
- [ ] Exactly one `CONSUMED` row exists in the ledger.
- [ ] No duplicate balance deduction occurs.

## 4. Data Integrity

| Status | Test | Expected Result |
|---|---|---|
| ⬜ | Approve a 3-day leave | Balance drops by exactly 3 days |
| ⬜ | Cancel the approved leave | Balance returns and both original + reversal rows remain |
| ⬜ | Reject a leave | Zero ledger rows are written |
| ⬜ | Run payroll twice for the same month | Only one payslip is created |
| ⬜ | Hit "Recompute attendance" | No data changes; operation is idempotent |

## 5. Polish Sweep

- [ ] Every page works correctly at 375px width.
- [ ] Every table has an empty state.
- [ ] Every button has a loading state.
- [ ] Keyboard tab navigation shows a visible focus ring.
- [ ] No `console.log` statements are left in the client.
- [ ] No raw JSON error reaches the user interface.
- [ ] Refreshing every page keeps the user signed in.
- [ ] Refreshing keeps the user on the same page.

## QA Results

**QA Lead:** Dev D  
**QA Start:** 15:00  
**Feature Freeze:** 15:30

### Bugs Found

| Issue | Severity | GitHub Issue | Status |
|---|---|---|---|
| — | — | — | — |

### Final Result

- [ ] Input handling passed
- [ ] Authorisation/security passed
- [ ] Concurrency test passed
- [ ] Data integrity passed
- [ ] Polish sweep passed
- [ ] Critical bugs resolved
- [ ] Ready for demo
