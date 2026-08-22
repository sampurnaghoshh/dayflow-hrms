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

Each employee should have:

- Employee code
- Full name
- Email
- Department
- Designation
- Date of joining
- Employment status
- Annual CTC
- Leave balance
- Reporting manager / approver where applicable

## 2. Attendance History

Generate approximately 6 months of attendance history for the seeded employees.

Attendance data should include a realistic mix of:

- Present
- Absent
- Half-day
- On leave
- Holidays
- Weekends

Include check-in and check-out times where applicable.

The attendance history should provide enough data for monthly attendance summaries and payroll calculations.

## 3. Leave Requests

Create approximately 25 leave requests across the 12 employees.

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

## 4. Holidays

Seed 8 real Indian public holidays for 2026.

Holiday data should include:

- Holiday name
- Holiday date
- Year

These holidays should be considered non-working days when calculating leave and attendance.

## 5. Salary Revisions

Create at least 3 salary revision records across different employees.

Each revision should contain:

- Employee
- Previous salary / CTC
- Revised salary / CTC
- Effective date
- Revision history

Historical revisions must remain available after the new salary becomes effective.

## 6. Low-Balance Demo Employee

Create one employee specifically for the insufficient-leave-balance demo.

Requirements:

- Current leave balance: **1.5 days**
- Demo leave request: **3 days**

This employee should be used to demonstrate the insufficient balance validation flow.

Expected error:

> You have 1.5 paid leave days available but requested 3.

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
