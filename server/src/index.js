/**
 * Express bootstrap. Wiring only - no routes are defined here, and no SQL.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { env } from './config/env.js';
import { closePool, pool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { router as authRouter } from './modules/auth/auth.routes.js';
import { router as leaveRouter } from './modules/leave/leave.routes.js';
import { router as approvalsRouter } from './modules/approvals/approvals.routes.js';

const app = express();

// Never advertise the framework.
app.disable('x-powered-by');

app.use(
  helmet({
    // This process serves JSON and, later, uploaded files - never HTML - so the
    // default CSP has no document to protect and only risks confusing responses.
    contentSecurityPolicy: false,
    // helmet defaults CORP to same-origin, which would stop the Vite dev server at
    // :5173 from rendering a profile photo served from :4000. The photo routes do
    // their own ownership checks, so relaxing the embed policy costs nothing here.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/*
 * CORS is locked to exactly one origin (§8). It cannot be a wildcard: the browser
 * refuses '*' together with credentials:true, and without credentials the session
 * cookie is never sent. env.js rejects a wildcard or a trailing slash so a typo
 * here fails at startup rather than as a confusing browser error later.
 */
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

// 1mb is plenty for JSON. File uploads go through multer, which has its own caps.
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, env: env.NODE_ENV });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/approvals', approvalsRouter);

// Order is load-bearing: unmatched paths become a 404 AppError, and every error -
// thrown, forwarded, or raised by postgres - leaves through the one handler.
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[dayflow] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  console.log(`[dayflow] CORS origin: ${env.CLIENT_ORIGIN}`);
});

// Finish in-flight requests, then let go of the database.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[dayflow] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  });
}

export { app, server };
