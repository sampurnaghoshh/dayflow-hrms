// Seed data for the mock adapter (client/src/api/mocks.js). Shapes mirror what the real
// endpoints in CLAUDE.md §6 are expected to return. Nothing here is persisted — mocks.js
// clones this on load and mutates the clone in memory for the life of the tab.

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

// Matches db/seed/01_reference.sql exactly, EXCEPT department 4 — see the note on 'DES'
// below; the seed file on disk still has ('SLS', 'Sales') there, not ('DES', 'Design').
export const departments = [
  { id: 1, code: 'ENG', name: 'Engineering' },
  { id: 2, code: 'PPL', name: 'People Operations' },
  { id: 3, code: 'FIN', name: 'Finance' },
  { id: 4, code: 'DES', name: 'Design' }, // per this session's instruction — NOT yet in the seed file (still 'SLS'/'Sales')
];

// Mock-only credential map. Never modeled on the real auth flow (no JWT, no hashing) —
// this exists purely so SignIn has something to check against with USE_MOCKS=true.
export const mockCredentials = [
  { email: 'ava.thompson@dayflow.io', password: 'Password1', userId: 1 },
  { email: 'marcus.lee@dayflow.io', password: 'Password1', userId: 2 },
  { email: 'sofia.garcia@dayflow.io', password: 'Password1', userId: 3 },
  { email: 'daniel.reyes@dayflow.io', password: 'Password1', userId: 4 },
  { email: 'priya.nair@dayflow.io', password: 'Password1', userId: 5 },
  { email: 'unverified@dayflow.io', password: 'Password1', userId: 6 },
];

export const employees = [
  {
    id: 1, userId: 1, employeeCode: 'DF-1001', fullName: 'Ava Thompson',
    email: 'ava.thompson@dayflow.io', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 1, departmentName: 'Engineering', managerId: 4, managerName: 'Daniel Reyes',
    designation: 'Software Engineer', dateOfJoining: '2023-03-14',
    phone: '+1 415 555 0134', address: '221 Market St, San Francisco, CA',
    profilePhotoPath: null, emailVerifiedAt: '2023-03-14T09:00:00Z', lastLoginAt: null,
  },
  {
    id: 2, userId: 2, employeeCode: 'DF-1002', fullName: 'Marcus Lee',
    email: 'marcus.lee@dayflow.io', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 4, departmentName: 'Design', managerId: null, managerName: null,
    designation: 'Product Designer', dateOfJoining: '2022-07-01',
    phone: '+1 415 555 0177', address: '88 Mission St, San Francisco, CA',
    profilePhotoPath: null, emailVerifiedAt: '2022-07-01T09:00:00Z', lastLoginAt: null,
  },
  {
    id: 3, userId: 3, employeeCode: 'DF-1003', fullName: 'Sofia Garcia',
    email: 'sofia.garcia@dayflow.io', role: 'HR', status: 'ACTIVE',
    departmentId: 2, departmentName: 'People Operations', managerId: null, managerName: null,
    designation: 'HR Business Partner', dateOfJoining: '2021-01-11',
    phone: '+1 415 555 0199', address: '500 Howard St, San Francisco, CA',
    profilePhotoPath: null, emailVerifiedAt: '2021-01-11T09:00:00Z', lastLoginAt: null,
  },
  {
    id: 4, userId: 4, employeeCode: 'DF-1004', fullName: 'Daniel Reyes',
    email: 'daniel.reyes@dayflow.io', role: 'ADMIN', status: 'ACTIVE',
    departmentId: 1, departmentName: 'Engineering', managerId: null, managerName: null,
    designation: 'Engineering Director', dateOfJoining: '2020-05-20',
    phone: '+1 415 555 0111', address: '1 Front St, San Francisco, CA',
    profilePhotoPath: null, emailVerifiedAt: '2020-05-20T09:00:00Z', lastLoginAt: null,
  },
  {
    id: 5, userId: 5, employeeCode: 'DF-1005', fullName: 'Priya Nair',
    email: 'priya.nair@dayflow.io', role: 'HR', status: 'ACTIVE',
    departmentId: 3, departmentName: 'Finance', managerId: null, managerName: null,
    designation: 'Finance Manager', dateOfJoining: '2021-09-02',
    phone: '+1 415 555 0155', address: '45 2nd St, San Francisco, CA',
    profilePhotoPath: null, emailVerifiedAt: '2021-09-02T09:00:00Z', lastLoginAt: null,
  },
  {
    id: 6, userId: 6, employeeCode: 'DF-1006', fullName: 'Noah Kim',
    email: 'unverified@dayflow.io', role: 'EMPLOYEE', status: 'PENDING_VERIFICATION',
    departmentId: 1, departmentName: 'Engineering', managerId: 4, managerName: 'Daniel Reyes',
    designation: 'Junior Developer', dateOfJoining: '2026-08-10',
    phone: null, address: null, profilePhotoPath: null,
    emailVerifiedAt: null, lastLoginAt: null,
  },
];

export const leaveTypes = [
  { id: 1, code: 'PAID', name: 'Paid Leave', isPaid: true, accrualPerMonth: 1.5, annualCap: 18, carryForwardCap: 5, requiresDocument: false, isActive: true },
  { id: 2, code: 'SICK', name: 'Sick Leave', isPaid: true, accrualPerMonth: 1, annualCap: 12, carryForwardCap: 0, requiresDocument: false, isActive: true },
  { id: 3, code: 'UNPAID', name: 'Unpaid Leave', isPaid: false, accrualPerMonth: 0, annualCap: null, carryForwardCap: 0, requiresDocument: false, isActive: true },
];

// v_leave_balances equivalent, pre-computed for the mock.
export const leaveBalances = [
  { employeeId: 1, leaveTypeId: 1, leaveCode: 'PAID', leaveName: 'Paid Leave', balance: 8.5, totalAccrued: 13.5, totalConsumed: 5 },
  { employeeId: 1, leaveTypeId: 2, leaveCode: 'SICK', leaveName: 'Sick Leave', balance: 4, totalAccrued: 6, totalConsumed: 2 },
  { employeeId: 1, leaveTypeId: 3, leaveCode: 'UNPAID', leaveName: 'Unpaid Leave', balance: 0, totalAccrued: 0, totalConsumed: 0 },
  { employeeId: 2, leaveTypeId: 1, leaveCode: 'PAID', leaveName: 'Paid Leave', balance: 1.5, totalAccrued: 10.5, totalConsumed: 9 },
  { employeeId: 2, leaveTypeId: 2, leaveCode: 'SICK', leaveName: 'Sick Leave', balance: 5, totalAccrued: 5, totalConsumed: 0 },
  { employeeId: 2, leaveTypeId: 3, leaveCode: 'UNPAID', leaveName: 'Unpaid Leave', balance: 0, totalAccrued: 0, totalConsumed: 0 },
];

export const leaveLedger = [
  { id: 1, employeeId: 1, leaveTypeId: 1, delta: 13.5, reason: 'ACCRUAL', refRequestId: null, note: 'Monthly accrual through Aug 2026', createdAt: '2026-08-01T00:00:00Z', runningBalance: 13.5 },
  { id: 2, employeeId: 1, leaveTypeId: 1, delta: -5, reason: 'CONSUMED', refRequestId: 101, note: null, createdAt: '2026-06-10T00:00:00Z', runningBalance: 8.5 },
  { id: 3, employeeId: 1, leaveTypeId: 2, delta: 6, reason: 'ACCRUAL', refRequestId: null, note: 'Monthly accrual through Aug 2026', createdAt: '2026-08-01T00:00:00Z', runningBalance: 6 },
  { id: 4, employeeId: 1, leaveTypeId: 2, delta: -2, reason: 'CONSUMED', refRequestId: 102, note: null, createdAt: '2026-07-02T00:00:00Z', runningBalance: 4 },
];

export const leaveRequests = [
  {
    id: 101, employeeId: 1, employeeName: 'Ava Thompson', leaveTypeId: 1, leaveCode: 'PAID',
    startDate: '2026-06-08', endDate: '2026-06-12', dayCount: 5, remarks: 'Family trip',
    status: 'APPROVED', currentStep: 2, createdAt: '2026-06-01T09:12:00Z', decidedAt: '2026-06-02T14:00:00Z',
    steps: [
      { id: 1001, stepNo: 1, approverRole: 'HR', approverName: 'Sofia Garcia', status: 'APPROVED', comment: 'Enjoy!', actedAt: '2026-06-01T15:00:00Z' },
      { id: 1002, stepNo: 2, approverRole: 'ADMIN', approverName: 'Daniel Reyes', status: 'APPROVED', comment: null, actedAt: '2026-06-02T14:00:00Z' },
    ],
  },
  {
    id: 102, employeeId: 1, employeeName: 'Ava Thompson', leaveTypeId: 2, leaveCode: 'SICK',
    startDate: '2026-07-02', endDate: '2026-07-03', dayCount: 2, remarks: 'Flu',
    status: 'APPROVED', currentStep: 1, createdAt: '2026-07-01T08:00:00Z', decidedAt: '2026-07-01T09:30:00Z',
    steps: [
      { id: 1003, stepNo: 1, approverRole: 'HR', approverName: 'Sofia Garcia', status: 'APPROVED', comment: null, actedAt: '2026-07-01T09:30:00Z' },
    ],
  },
  {
    id: 103, employeeId: 1, employeeName: 'Ava Thompson', leaveTypeId: 1, leaveCode: 'PAID',
    startDate: isoDate(daysAgo(-10)), endDate: isoDate(daysAgo(-8)), dayCount: 3, remarks: 'Conference',
    status: 'PENDING', currentStep: 1, createdAt: new Date().toISOString(), decidedAt: null,
    steps: [
      { id: 1004, stepNo: 1, approverRole: 'HR', approverName: null, status: 'PENDING', comment: null, actedAt: null },
      { id: 1005, stepNo: 2, approverRole: 'ADMIN', approverName: null, status: 'PENDING', comment: null, actedAt: null },
    ],
  },
  {
    id: 104, employeeId: 2, employeeName: 'Marcus Lee', leaveTypeId: 1, leaveCode: 'PAID',
    startDate: isoDate(daysAgo(-3)), endDate: isoDate(daysAgo(-3)), dayCount: 1, remarks: 'Dentist',
    status: 'PENDING', currentStep: 1, createdAt: new Date().toISOString(), decidedAt: null,
    steps: [
      { id: 1006, stepNo: 1, approverRole: 'HR', approverName: null, status: 'PENDING', comment: null, actedAt: null },
    ],
  },
  {
    id: 105, employeeId: 2, employeeName: 'Marcus Lee', leaveTypeId: 3, leaveCode: 'UNPAID',
    startDate: '2026-05-04', endDate: '2026-05-04', dayCount: 1, remarks: 'Personal',
    status: 'REJECTED', currentStep: 1, createdAt: '2026-05-01T10:00:00Z', decidedAt: '2026-05-01T16:00:00Z',
    steps: [
      { id: 1007, stepNo: 1, approverRole: 'HR', approverName: 'Priya Nair', status: 'REJECTED', comment: 'Team is short-staffed that week — please pick another date.', actedAt: '2026-05-01T16:00:00Z' },
    ],
  },
  {
    id: 106, employeeId: 1, employeeName: 'Ava Thompson', leaveTypeId: 2, leaveCode: 'SICK',
    startDate: '2026-04-10', endDate: '2026-04-10', dayCount: 1, remarks: 'Migraine',
    status: 'CANCELLED', currentStep: 1, createdAt: '2026-04-09T08:00:00Z', decidedAt: null,
    steps: [
      { id: 1008, stepNo: 1, approverRole: 'HR', approverName: null, status: 'SKIPPED', comment: null, actedAt: null },
    ],
  },
];

export const holidays = [
  { id: 1, holidayDate: '2026-01-01', name: "New Year's Day" },
  { id: 2, holidayDate: '2026-07-04', name: 'Independence Day' },
  { id: 3, holidayDate: '2026-12-25', name: 'Christmas Day' },
];

function buildAttendanceDays(employeeId, pattern) {
  return pattern.map((status, i) => {
    const d = daysAgo(pattern.length - 1 - i);
    const dow = d.getDay();
    const worked = status === 'PRESENT' ? 480 : status === 'HALF_DAY' ? 240 : 0;
    return {
      employeeId,
      workDate: isoDate(d),
      status: dow === 0 || dow === 6 ? 'WEEKEND' : status,
      workedMinutes: dow === 0 || dow === 6 ? 0 : worked,
      firstIn: worked > 0 ? `${isoDate(d)}T09:00:00Z` : null,
      lastOut: worked > 0 ? `${isoDate(d)}T${worked >= 480 ? '17' : '13'}:00:00Z` : null,
    };
  });
}

export const attendanceDays = [
  ...buildAttendanceDays(1, ['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT', 'PRESENT', 'HALF_DAY', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT']),
  ...buildAttendanceDays(2, ['PRESENT', 'PRESENT', 'HALF_DAY', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT']),
];

export const todayPresence = [
  { employeeId: 1, employeeName: 'Ava Thompson', departmentName: 'Engineering', status: 'PRESENT', firstIn: `${isoDate(daysAgo(0))}T09:02:00Z`, lastOut: null },
  { employeeId: 2, employeeName: 'Marcus Lee', departmentName: 'Design', status: 'PRESENT', firstIn: `${isoDate(daysAgo(0))}T08:47:00Z`, lastOut: null },
  { employeeId: 3, employeeName: 'Sofia Garcia', departmentName: 'People Operations', status: 'ON_LEAVE', firstIn: null, lastOut: null },
  { employeeId: 6, employeeName: 'Noah Kim', departmentName: 'Engineering', status: 'ABSENT', firstIn: null, lastOut: null },
];

export const salaryVersions = [
  {
    id: 1, employeeId: 1, effectiveFrom: '2023-03-14', effectiveTo: '2026-01-01', ctcAnnual: 96000,
    createdBy: 'Daniel Reyes', createdAt: '2023-03-01T00:00:00Z',
    components: [
      { code: 'BASIC', label: 'Basic', kind: 'EARNING', monthlyAmount: 4000 },
      { code: 'HRA', label: 'House Rent Allowance', kind: 'EARNING', monthlyAmount: 1600 },
      { code: 'SPECIAL', label: 'Special Allowance', kind: 'EARNING', monthlyAmount: 2400 },
      { code: 'PF', label: 'Provident Fund', kind: 'DEDUCTION', monthlyAmount: 480 },
    ],
  },
  {
    id: 2, employeeId: 1, effectiveFrom: '2026-01-01', effectiveTo: null, ctcAnnual: 108000,
    createdBy: 'Daniel Reyes', createdAt: '2025-12-20T00:00:00Z',
    components: [
      { code: 'BASIC', label: 'Basic', kind: 'EARNING', monthlyAmount: 4500 },
      { code: 'HRA', label: 'House Rent Allowance', kind: 'EARNING', monthlyAmount: 1800 },
      { code: 'SPECIAL', label: 'Special Allowance', kind: 'EARNING', monthlyAmount: 2700 },
      { code: 'PF', label: 'Provident Fund', kind: 'DEDUCTION', monthlyAmount: 540 },
      { code: 'PT', label: 'Professional Tax', kind: 'DEDUCTION', monthlyAmount: 200 },
    ],
  },
];

export const payslips = [
  {
    id: 1, employeeId: 1, periodMonth: '2026-07-01', salaryVersionId: 2,
    payableDays: 31, lopDays: 0, grossEarnings: 9000, totalDeductions: 740, netPay: 8260,
    generatedAt: '2026-08-01T06:00:00Z',
    lineItems: [
      { code: 'BASIC', label: 'Basic', kind: 'EARNING', amount: 4500 },
      { code: 'HRA', label: 'House Rent Allowance', kind: 'EARNING', amount: 1800 },
      { code: 'SPECIAL', label: 'Special Allowance', kind: 'EARNING', amount: 2700 },
      { code: 'PF', label: 'Provident Fund', kind: 'DEDUCTION', amount: 540 },
      { code: 'PT', label: 'Professional Tax', kind: 'DEDUCTION', amount: 200 },
    ],
  },
];

export const notifications = [
  { id: 1, userId: 1, title: 'Leave request approved', body: 'Your Jun 8–12 paid leave was approved by Daniel Reyes.', link: '/leave/history', readAt: '2026-06-02T14:05:00Z', createdAt: '2026-06-02T14:00:00Z' },
  { id: 2, userId: 1, title: 'New payslip available', body: 'Your July 2026 payslip is ready.', link: '/payslips', readAt: null, createdAt: '2026-08-01T06:00:00Z' },
  { id: 3, userId: 4, title: 'New leave request', body: 'Ava Thompson requested 3 days of paid leave.', link: '/admin/approvals', readAt: null, createdAt: new Date().toISOString() },
  { id: 4, userId: 3, title: 'New leave request', body: 'Marcus Lee requested 1 day of paid leave.', link: '/admin/approvals', readAt: null, createdAt: new Date().toISOString() },
];

export const employeeDocuments = [
  { id: 1, employeeId: 1, docType: 'OFFER_LETTER', originalName: 'offer-letter.pdf', mimeType: 'application/pdf', sizeBytes: 182_000, uploadedAt: '2023-03-14T00:00:00Z' },
  { id: 2, employeeId: 1, docType: 'ID_PROOF', originalName: 'passport.jpg', mimeType: 'image/jpeg', sizeBytes: 640_000, uploadedAt: '2023-03-15T00:00:00Z' },
];
