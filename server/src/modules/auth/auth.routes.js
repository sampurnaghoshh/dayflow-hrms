/**
 * Wiring only: no logic, no SQL. Each handler validates, calls the service,
 * and shapes the HTTP response.
 */
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { requireAuth, setAuthCookie, clearAuthCookie } from '../../middleware/auth.js';
import { loginSchema, registerSchema, verifyQuerySchema } from './auth.schema.js';
import * as service from './auth.service.js';

export const router = Router();

/**
 * §8: 5 attempts per 15 minutes per email.
 *
 * Keyed on the email rather than the IP because that is what §8 specifies: it protects
 * an individual account from being ground down, and does not punish everyone behind a
 * shared NAT. It does not by itself stop a spray across many addresses from one host;
 * an IP-keyed limiter could be layered on top without changing this one.
 *
 * Mounted after validate(), so req.body.email is already normalised and a malformed
 * body - which was never a credential guess - does not consume anyone's budget.
 */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFrom: (req) => req.body?.email ?? null,
  code: 'TOO_MANY_LOGIN_ATTEMPTS',
});

// POST /api/auth/register  (public) - SRS 3.1.1
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { user, employee, openingBalances, verification } = await service.registerUser(req.body);
    res.status(201).json({
      user: {
        id: user.id,
        employeeCode: user.employee_code,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      employee: { id: employee.id, fullName: employee.full_name },
      openingBalances,
      // Present only outside production - see the comment in auth.service.js.
      ...(verification ? { verification } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify?token=...  (public)
router.get('/verify', validate(verifyQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { alreadyVerified } = await service.verifyEmail(req.query.token);
    res.json({
      verified: true,
      alreadyVerified,
      message: alreadyVerified
        ? 'This account was already verified. You can sign in.'
        : 'Your email address is verified. You can sign in now.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  (public) - SRS 3.1.2
router.post('/login', validate(loginSchema), loginRateLimit, async (req, res, next) => {
  try {
    const { token, user } = await service.login(req.body);
    setAuthCookie(res, token);
    // A correct password clears the budget, so earlier typos cannot lock a user out.
    loginRateLimit.clear(req.body.email);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout  (any)
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me  (any authenticated)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await service.getAuthContext(req.user.id));
  } catch (err) {
    next(err);
  }
});
