// The real backend (see docs/api-shapes.md) returns raw `pg` query rows nested inside
// hand-written envelopes: envelope/computed keys are camelCase, but row data straight from
// SQL is snake_case column names, and every BIGINT/NUMERIC column comes back as a STRING
// (node-postgres does this so values past 2^53 and arbitrary-precision decimals stay exact —
// see CLAUDE.md §1.9 and §4). This is the one place that translates that wire format into
// what every screen assumes: camelCase keys, real JS numbers for ids and money/leave-day
// figures. Applied to every response — real or mocked — in client.js, so screens never see
// the difference.
//
// Converting every numeric-looking string blindly would be wrong (a bare-digit phone number
// or an all-digit employee code would get silently mangled into a number), so only two kinds
// of keys are converted: anything that is or ends with an id (`id`, `employeeId`,
// `departmentId`, `stepId`, ...) and an explicit whitelist of the NUMERIC(...) columns listed
// in CLAUDE.md §4 (day counts, balances, money). Everything else — dates, timestamps, codes,
// names, phone numbers — passes through untouched.
const NUMERIC_VALUE_KEYS = new Set([
  'dayCount', 'delta', 'balance', 'runningBalance', 'totalAccrued', 'totalConsumed',
  'accrualPerMonth', 'annualCap', 'carryForwardCap', 'ctcAnnual', 'monthlyAmount',
  'payableDays', 'lopDays', 'grossEarnings', 'totalDeductions', 'netPay', 'amount', 'consumed',
]);

function toCamelCase(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumericString(value) {
  return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
}

export function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = toCamelCase(rawKey);
    const isIdField = key === 'id' || key.endsWith('Id');
    if (isNumericString(rawValue) && (isIdField || NUMERIC_VALUE_KEYS.has(key))) {
      out[key] = Number(rawValue);
    } else {
      out[key] = normalize(rawValue);
    }
  }
  return out;
}
