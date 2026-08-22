# Dayflow interface copy

## Copy principles

- Use sentence case everywhere.
- Use active voice.
- Match the button verb with its confirmation.
- Errors should explain what happened and what the user should do next.
- Never expose raw technical errors to users.

## Empty and validation states

| Situation | Approved copy | Never use |
|---|---|---|
| Empty leave history | You haven't applied for any leave yet. Apply for leave to see it here. | No records found |
| Empty approval queue | Nothing waiting on you. New requests appear here as they're submitted. | No data |
| Insufficient balance | You have 1.5 paid leave days available but requested 3. | Invalid request |
| Overlapping dates | You already have leave applied for 12–14 March. | Conflict error |
| Someone else decided first | Priya already approved this request. | 409 Conflict |
| Bad login | Email or password is incorrect. | User not found |
| Unverified account | Verify your email to sign in. We sent a link when you registered. | Access denied |
| File too large | That file is 8 MB. The limit is 5 MB. | Upload failed |
| Reject without comment | Add a comment so the employee knows why. | Comment required |

## Action confirmations

| Action | Button | Confirmation |
|---|---|---|
| Approve a request | Approve | Approved |

## Password guidance

At least 8 characters, with an uppercase letter, a lowercase letter and a number.
