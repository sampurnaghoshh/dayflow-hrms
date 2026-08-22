# Dayflow HRMS — Seed Data Plan

## Purpose

This seed plan defines the demo data required for Dayflow HRMS so that employee management, attendance, leave, payroll, approvals, and dashboard features have realistic data during the final demonstration.

## 1. Employees

Create 12 employees distributed across the four departments.

| Department | Number of Employees |
|---|---:|
| Engineering | 4 |
| People Ops | 3 |
| Finance | 3 |
| Design | 2 |
| **Total** | **12** |

### Role Distribution

| Role | Number |
|---|---:|
| Admin | 1 |
| HR | 2 |
| Employee | 9 |
| **Total** | **12** |

The seeded employee hierarchy should include one Admin, two HR users, and nine regular employees, with reporting-manager relationships populated where applicable.

Each employee should have:

- Employee code
- Full name
- Email
- Department
- Designation
- Date of joining
- User account status (stored on `users.status`)
- Annual CTC
- Leave balances must not be stored as employee attributes. Seed opening ledger rows instead; the employee's balance is computed from the sum of ledger entries.
- Reporting manager / approver where applicable

  All demo accounts must be seeded as verified and loginable. Set `users.status = 'ACTIVE'` and populate `email_verified_at` so the demo accounts can sign in immediately.

Demo password for all seeded accounts: `Dayflow@2026`

## 2. Attendance History

Generate approximately 6 months of attendance history for the seeded employees.

Attendance data should include a realistic mix of:

- Present
- Absent
- Half-day
- On leave

Holiday and weekend statuses should not be seeded directly. Seed the required punches and calendar data; deriveDay() should derive holiday and weekend statuses from the calendar.

Include check-in and check-out times where applicable.

The attendance history should provide enough data for monthly attendance summaries and payroll calculations.

### Attendance Pattern Requirements

The six-month attendance history must include:

- A few employees with recurring late arrivals.
- Two employees with a repeated Monday-absence pattern so the attendance anomaly KPI has meaningful data to identify.
- A scattering of half-day attendance records.
- Full or near-full attendance for most employees.
- Check-in and check-out punches where applicable.

## 3. Leave Requests

Create approximately 25 leave requests across the 12 employees.

### Leave Request Distribution

| Status | Target |
|---|---:|
| Approved | 12 |
| Pending | 6 |
| Rejected | 4 |
| Cancelled after approval | 3 |
| **Total** | **25** |

The three cancelled requests must have been approved before cancellation. Each should demonstrate the ledger reversal flow: the original `CONSUMED` ledger entry remains and a corresponding `REVERSAL` entry is created.

The six pending requests should be distributed across both approval steps so the approval workflow can be demonstrated at each level.

The four rejected requests should contain realistic rejection comments.

Include a mixture of:

- Pending requests
- Approved requests
- Rejected requests
- Cancelled requests

Requests should vary in duration and date range.

The seeded leave data should exercise:

- Leave balances
- Approval workflow
- Leave history
- Leave ledger entries
- Attendance integration

When generating leave requests, avoid overlapping live requests for the same employee. PENDING and APPROVED requests must not overlap because the database constraint blocks overlapping live leave. REJECTED and CANCELLED requests may overlap because they are not considered live.


## 4. Holidays

Seed 8 real Indian public holidays for 2026.

Holiday data should include:

- Holiday name
- Holiday date
- Year

These holidays should be considered non-working days when calculating leave and attendance.

At least one seeded leave request must span Republic Day (26 January 2026) so the demo visibly proves that a weekday public holiday is excluded from leave-day calculations.


## 5. Salary Revisions

Create at least 3 salary revision records across different employees.

Each revision should contain:

- Employee
- `ctc_annual`
- `effective_from`
- `effective_to`
- Previous salary is represented by the previous version row, not by a separate "previous salary" field.
- When a revision is seeded, close the old salary version and create the new version in the same transaction so version history is preserved and active date ranges do not overlap.

Historical revisions must remain available after the new salary becomes effective.

### Required Demo Accounts

| Email | Password | Role | Seed Profile |
|---|---|---|---|
| admin@dayflow.io | Dayflow@2026 | ADMIN | Admin account |
| hr@dayflow.io | Dayflow@2026 | HR | HR approval account |
| priya@dayflow.io | Dayflow@2026 | EMPLOYEE | Rich history + low leave balance |
| arjun@dayflow.io | Dayflow@2026 | EMPLOYEE | Clean-slate employee |

All four accounts must be seeded with `users.status = 'ACTIVE'` and a populated `email_verified_at`.

## 6. Low-Balance Demo Employee

Use Priya (`priya@dayflow.io`) as the employee for the insufficient-leave-balance demo.

Requirements:

- Seed PAID leave ledger entries whose current sum is **1.50 days**.
- Demo leave request: **3 days**

This employee should be used to demonstrate the insufficient balance validation flow.

Expected error:

> You have 1.50 paid leave days available but requested 3.
The 1.50-day balance must come from ledger entries, not a stored balance field. Seed accrual/opening rows so the ledger sum produces exactly 1.50 at demo time.

The demo employee may still have six months of attendance history. Do not derive the 1.50-day demo balance solely from six months of automatic accrual; construct the opening/accrual ledger history so that the current PAID ledger sum is exactly 1.50 days at demo time.

## 7. Demo Data Coverage

The final seeded dataset should allow the team to demonstrate:

- Employee directory
- Employee profile
- Attendance history
- Check-in / check-out
- Leave application
- Leave approval
- Leave rejection
- Leave cancellation
- Insufficient leave balance
- Leave ledger
- Payroll
- Salary revisions
- Holiday handling
- Dashboard summaries

## Seed Data Summary

| Data | Target |
|---|---:|
| Employees | 12 |
| Departments | 4 |
| Attendance history | ~6 months |
| Leave requests | ~25 |
| Public holidays | 8 |
| Salary revisions | At least 3 |
| Low-balance demo employee | 1 |

## Handoff

This document defines the seed-data requirements for implementation.

Dev A can use this plan to implement the actual database seed script and ensure the final demo contains enough realistic data to exercise the major Dayflow HRMS workflows.
