# Dayflow interface copy

> Every workday, perfectly aligned.

This document defines the approved user-facing language for Dayflow HRMS.
All application UI copy should follow these rules unless a specific exception
is documented.

## 1. Copy principles

- Use sentence case everywhere.
- Use active voice.
- Keep language concise and specific.
- Prefer plain language over technical terminology.
- Tell the user what happened and what they can do next.
- Never expose database errors, HTTP status codes, stack traces, SQL errors,
  or raw API responses to users.
- Match the button verb with the resulting confirmation.
- Do not blame the user for an error.
- Use consistent terminology throughout the application.
- Use exact numbers when they help the user make a decision.
- Do not use vague messages such as "Something went wrong", "Invalid request",
  or "No data".
- Confirmation messages should describe the completed action.
- Destructive or irreversible actions should explain their consequence before
  confirmation.
- Error messages should appear close to the field or action that caused them.
- Preserve user-entered text exactly where appropriate, including emoji.

---

## 2. Product terminology

Use these terms consistently.

| Concept | Approved term | Avoid |
|---|---|---|
| Human resources system | HRMS | HR software |
| Regular user | Employee | User, Staff |
| Management user | Admin / HR | Manager account |
| Time away from work | Leave | Time off, Holiday |
| Employee attendance action | Check in / Check out | Punch in / Punch out |
| Leave awaiting decision | Pending | Waiting |
| Accepted leave | Approved | Accepted |
| Declined leave | Rejected | Denied |
| Leave withdrawn after approval | Cancelled | Deleted |
| Employee salary information | Salary structure | Pay data |
| Employee salary document | Payslip | Pay slip |
| Employee records | Profile | Account details |
| Employee request | Leave request | Application |
| Decision maker | Approver | Reviewer |
| Additional explanation | Comment / Remarks | Note, Reason text |
| Remaining leave | Leave balance | Leave count |

---

## 3. Global navigation and actions

### Primary navigation

Use:

- Dashboard
- Profile
- Attendance
- Leave
- Payroll
- Employees
- Approvals
- Reports
- Logout

Only display navigation items that the current role is authorised to access.

### Common buttons

| Action | Button text | Success confirmation |
|---|---|---|
| Save changes | Save changes | Changes saved |
| Cancel editing | Cancel | Changes discarded |
| Check in | Check in | Checked in |
| Check out | Check out | Checked out |
| Apply for leave | Apply for leave | Leave request submitted |
| Approve request | Approve | Approved |
| Reject request | Reject | Rejected |
| Cancel leave | Cancel leave | Leave cancelled |
| Upload document | Upload document | Document uploaded |
| Update profile | Save changes | Profile updated |
| Log out | Log out | Logged out |
| Retry failed operation | Try again | — |
| Go back | Back | — |

Do not use:

- Submit → Success!
- Done → Completed!
- Click here
- Proceed
- Execute
- Confirm action

when a more specific action verb is available.

---

## 4. Authentication copy

Dayflow requires secure authentication and email verification.
Users sign in using their email and password. Successful authentication
takes the user to the dashboard.

### Sign-up

Page title:

**Create your account**

Field labels:

- Employee ID
- Email
- Password
- Role

Password hint shown before typing:

**At least 8 characters, with an uppercase letter, a lowercase letter and a number.**

Email verification message:

**Verify your email to sign in. We sent a link when you registered.**

Existing email:

**An account with this email already exists. Try signing in or use a
different email.**

Invalid email:

**Enter a valid email address.**

Invalid employee ID:

**Enter a valid employee ID.**

Weak password:

**Use at least 8 characters, including an uppercase letter, a lowercase
letter and a number.**

### Sign-in

Page title:

**Sign in**

Incorrect credentials:

**Email or password is incorrect.**

Do not reveal whether an email address exists.

Unverified account:

**Verify your email to sign in. We sent a link when you registered.**

Successful sign-in:

**Signed in**

Session expired:

**Your session has expired. Sign in again to continue.**

Unauthorised page:

**You don't have permission to view this page.**

Do not display:

- User not found
- Invalid user
- 401 Unauthorized
- 403 Forbidden
- JWT error
- Authentication failed: token invalid

---

## 5. Dashboard copy

### Employee dashboard

The employee dashboard provides quick access to:

- Profile
- Attendance
- Leave requests
- Payroll
- Logout

Useful headings:

**Today's attendance**

**Leave balance**

**Recent activity**

**Upcoming leave**

Empty recent activity:

**No recent activity yet. Your attendance and leave activity will appear here.**

No upcoming leave:

**You don't have any upcoming leave.**

### Admin / HR dashboard

The management dashboard can show:

- Employee list
- Attendance records
- Leave approvals
- Payroll information
- Reports and analytics

Suggested headings:

**Employees**

**Attendance overview**

**Leave approvals**

**Payroll overview**

**Recent activity**

Empty approval queue:

**Nothing waiting on you. New requests appear here as they're submitted.**

---

## 6. Profile copy

The profile area contains personal details, job details, salary structure,
documents, and profile picture.

### Employee-editable fields

Employees may edit:

- Address
- Phone
- Profile picture

Heading:

**Personal details**

Success:

**Profile updated**

Unsaved changes:

**You have unsaved changes.**

Discard confirmation:

**Discard your changes? Your unsaved changes will be lost.**

### Restricted fields

If an employee attempts to edit a field they cannot change:

**You don't have permission to change this field. Contact HR if you need
an update.**

Do not silently save restricted changes.

### Admin editing

Admin users may edit employee details.

Success:

**Employee details updated**

---

## 7. Attendance copy

Attendance supports daily and weekly views, including check-in and
check-out.

### Status labels

Use:

- Present
- Absent
- Half-day
- On leave
- Holiday
- Weekend

### Check-in

Button:

**Check in**

Success:

**Checked in**

Already checked in:

**You're already checked in today.**

### Check-out

Button:

**Check out**

Success:

**Checked out**

No check-in:

**You can't check out because you haven't checked in today.**

Already checked out:

**You're already checked out today.**

### Attendance empty state

**No attendance records yet. Your attendance will appear here after your
first check-in.**

### Attendance access

Employees viewing another employee's attendance should see:

**You don't have permission to view this attendance record.**

The interface should not expose internal API errors or security details.

---

## 8. Leave management copy

Employees can select a leave type, choose a date range, and add remarks.
Supported leave types include paid, sick, and unpaid leave.

### Page headings

**Leave**

**Leave balance**

**Leave history**

**Apply for leave**

### Leave types

- Paid leave
- Sick leave
- Unpaid leave

### Leave form

Field labels:

- Leave type
- Start date
- End date
- Remarks

Submit button:

**Apply for leave**

Success:

**Leave request submitted**

### Empty leave history

**You haven't applied for any leave yet. Apply for leave to see it here.**

### Date validation

End date before start date:

**End date must be on or after the start date.**

Past dates:

**Leave dates can't be in the past. Choose today or a future date.**

Weekend-only range:

**That range has no working days. Choose at least one working day.**

Overlapping request:

**You already have leave applied for 12–14 March. Choose different dates.**

Replace the dates with the actual conflicting dates.

### Leave balance

Insufficient balance:

**You have 1.5 paid leave days available but requested 3.**

The available balance must be shown using the actual current balance.

Preview:

**Days requested: 3**

**Balance after approval: 1.5 days**

Do not allow the user to submit a request that exceeds the available
balance when the business rule requires it to be blocked.

### Remarks

Normal helper text:

**Add any details your approver should know.**

Too many characters:

**Your remarks are too long. The limit is 5,000 characters.**

HTML/script input must be displayed as literal text and never executed.

### Emoji

Names and remarks containing emoji should be accepted and displayed
correctly.

---

## 9. Leave status copy

Use only these status labels:

| Status | Display text |
|---|---|
| PENDING | Pending |
| APPROVED | Approved |
| REJECTED | Rejected |
| CANCELLED | Cancelled |
| HALF_DAY | Half-day |
| ON_LEAVE | On leave |
| PRESENT | Present |
| ABSENT | Absent |
| HOLIDAY | Holiday |
| WEEKEND | Weekend |

Do not use different labels for the same status in different screens.

---

## 10. Approval copy

Admin and HR users can view and decide leave requests.

### Approval queue

Heading:

**Leave approvals**

Empty state:

**Nothing waiting on you. New requests appear here as they're submitted.**

### Approve

Button:

**Approve**

Confirmation:

**Approve**

Success:

**Approved**

If another approver has already decided:

**Priya already approved this request.**

The name should come from the actual request and decision record.

### Reject

Button:

**Reject**

If a comment is required:

**Add a comment so the employee knows why.**

Success:

**Rejected**

Example rejection comment:

**Your requested dates overlap with an existing approved leave period.**

Use a specific explanation rather than a generic rejection reason.

### Cancel approved leave

Button:

**Cancel leave**

Confirmation:

**Cancel this approved leave? The leave balance will be restored.**

Success:

**Leave cancelled**

The cancellation must not be presented as deletion of history.

---

## 11. Leave ledger copy

The leave balance is represented by a transaction history.

Heading:

**Leave balance**

Subheading:

**Transaction history**

Columns:

- Date
- Reason
- Delta
- Balance

Example:

    DATE          REASON                 DELTA       BALANCE
    ---------------------------------------------------------
    01 Jan 2026  Opening balance        +6.00         6.00
    01 Feb 2026  Monthly accrual        +1.50         7.50
    14 Feb 2026  Leave #23 approved     -2.00         5.50
    16 Feb 2026  Leave #23 cancelled    +2.00         7.50

Ledger terminology:

- Opening balance
- Monthly accrual
- Leave approved
- Leave cancelled
- Consumed
- Reversal

A cancelled approved leave must remain visible in the history.

Do not use:

- Deleted
- Removed
- Balance manually updated

The UI should communicate that the history is preserved.

---

## 12. Payroll and salary copy

Employees can view payroll information but cannot edit it.

Admin users can view payroll information for all employees and update
salary structures.

### Employee payroll

Heading:

**Payroll**

**Salary structure**

**Payslips**

Read-only helper text:

**Payroll information is read-only for employees.**

No payslips:

**No payslips are available yet.**

### Salary revision

Use:

**Salary revised**

**Effective from**

**Previous salary**

**Updated salary**

Do not hide previous salary versions where the application provides
salary history.

### Admin payroll

Heading:

**Payroll management**

Actions:

**Update salary structure**

Success:

**Salary structure updated**

---

## 13. Documents and uploads

Upload button:

**Upload document**

File too large:

**That file is 8 MB. The limit is 5 MB.**

Unsupported file:

**This file type isn't supported. Upload a PDF or another supported format.**

MIME mismatch:

**The uploaded file type doesn't match its file extension. Choose a valid
file and try again.**

Upload success:

**Document uploaded**

Upload failure:

**We couldn't upload that document. Check the file type and size, then try again.**

Never display:

- Upload failed
- MIME error
- Stack trace
- Raw server response

---

## 14. Notifications and alerts

Notifications should describe the event and, where useful, the next action.

Examples:

**Your leave request was approved.**

**Your leave request was rejected.**

**Your leave request was cancelled.**

**Your salary structure was updated.**

**You have a leave request waiting for your approval.**

Unread notification indicator:

**Unread notifications**

No notifications:

**You're all caught up. New notifications will appear here.**

---

## 15. Reports and analytics

The system provides analytics and reports such as salary slips and
attendance information.

Use clear titles:

- Attendance report
- Salary report
- Leave report
- Payroll report

No report data:

**There isn't enough data to show this report yet.**

Failed report generation:

**We couldn't generate the report. Try again.**

Do not expose SQL or server errors.

---

## 16. Loading states

Every action that communicates with the server should provide feedback.

Examples:

- Saving…
- Signing in…
- Checking in…
- Checking out…
- Applying for leave…
- Approving…
- Rejecting…
- Uploading…
- Loading employees…
- Loading attendance…

The original action should not be submitted repeatedly while it is loading.

---

## 17. Empty states

Every major table or list must have a meaningful empty state.

| Screen | Empty state |
|---|---|
| Leave history | You haven't applied for any leave yet. Apply for leave to see it here. |
| Approval queue | Nothing waiting on you. New requests appear here as they're submitted. |
| Attendance | No attendance records yet. Your attendance will appear here after your first check-in. |
| Notifications | You're all caught up. New notifications will appear here. |
| Payslips | No payslips are available yet. |
| Documents | No documents have been uploaded yet. |
| Employees | No employees match your search. |
| Reports | There isn't enough data to show this report yet. |

Never use:

- No data
- No records found
- Nothing here
- Empty
- N/A

unless there is genuinely no more useful explanation.

---

## 18. Error handling

Errors should answer two questions:

1. What happened?
2. What should the user do next?

### General error

Use:

**We couldn't complete that action. Try again.**

Only use this when a more specific explanation is not available.

### Network failure

**We couldn't connect to Dayflow. Check your connection and try again.**

### Permission error

**You don't have permission to perform this action.**

### Missing record

**We couldn't find that record. It may have been removed or you may not
have access to it.**

Do not expose:

- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 500 Internal Server Error

Instead, convert technical errors into user-facing messages.

---

## 19. Concurrency messages

When two users act on the same approval request, only one decision should
succeed.

If another user has already decided:

**Priya already approved this request.**

The second user should not see a generic technical conflict message.

Do not display:

**409 Conflict**

or:

**This resource has been modified.**

The interface should explain the business outcome instead.

---

## 20. Confirmation messages

Use the same action verb in the button and confirmation.

| Action | Button | Confirmation |
|---|---|---|
| Approve | Approve | Approved |
| Reject | Reject | Rejected |
| Apply | Apply for leave | Leave request submitted |
| Check in | Check in | Checked in |
| Check out | Check out | Checked out |
| Cancel leave | Cancel leave | Leave cancelled |
| Save | Save changes | Changes saved |
| Upload | Upload document | Document uploaded |

Avoid generic confirmations such as:

- Success!
- Done!
- Completed!
- Operation successful!

---

## 21. Destructive actions

Before destructive or consequential actions, explain what will happen.

Example:

**Cancel this approved leave? The leave balance will be restored.**

Buttons:

**Keep leave**

**Cancel leave**

Never use ambiguous buttons such as:

**Yes**

**No**

for consequential actions.

---

## 22. Accessibility copy rules

- Form fields must have visible, descriptive labels.
- Do not rely on placeholder text as the only label.
- Error messages should identify the affected field.
- Status information should not rely on colour alone.
- Loading states should communicate that an action is in progress.
- Buttons should describe their action.
- Do not use icons without an accessible label when the icon is the only
  control.
- Focus states must remain visible.
- Error text must remain understandable without colour.

---

## 23. Security-sensitive copy

Never reveal information that helps an unauthorised user discover
whether another account, employee, or protected resource exists.

For authentication:

**Email or password is incorrect.**

For protected resources:

**You don't have permission to view this page.**

Do not display internal identifiers, database errors, stack traces,
JWT errors, SQL messages, or raw API responses.

---

## 24. Copy checklist for developers

Before merging a UI change, check:

- [ ] Sentence case is used.
- [ ] Active voice is used.
- [ ] Button text describes the action.
- [ ] Success text uses the same action terminology.
- [ ] Empty states explain what the user can do next.
- [ ] Errors explain what happened.
- [ ] Errors explain what the user should do next.
- [ ] No raw technical errors are displayed.
- [ ] No HTTP status codes are displayed to users.
- [ ] No database terminology is exposed.
- [ ] Password guidance appears before submission.
- [ ] Exact figures are shown for balance/validation errors.
- [ ] Conflicting dates are named when relevant.
- [ ] Permission errors do not expose sensitive information.
- [ ] Loading states are present for asynchronous actions.
- [ ] Destructive actions explain their consequence.
- [ ] Status names are consistent throughout the application.
- [ ] Accessibility labels are present where required.
- [ ] User-entered text is safely rendered as text.
