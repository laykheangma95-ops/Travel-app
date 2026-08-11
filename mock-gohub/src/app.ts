import express, { type NextFunction, type Request, type Response } from 'express';
import { requireAuth } from './auth';
import { fail } from './envelope';
import { balanceRouter } from './routes/balance';
import { catalogRouter } from './routes/catalog';
import { dataUsageRouter } from './routes/dataUsage';
import { devRouter } from './routes/dev';
import { ordersRouter } from './routes/orders';
import { qrRouter } from './routes/qr';

/** Route table, used only to tell 404 apart from 405. */
const ROUTES: Array<{ pattern: RegExp; methods: string[] }> = [
  { pattern: /^\/api\/categories$/, methods: ['GET'] },
  { pattern: /^\/api\/listings$/, methods: ['GET'] },
  { pattern: /^\/api\/items$/, methods: ['GET'] },
  { pattern: /^\/api\/balance$/, methods: ['GET'] },
  { pattern: /^\/api\/orders$/, methods: ['GET', 'POST'] },
  { pattern: /^\/api\/orders\/topup$/, methods: ['POST'] },
  { pattern: /^\/api\/orders\/data-usage\/[^/]+$/, methods: ['GET'] },
  { pattern: /^\/api\/orders\/[^/]+\/(confirmed|canceled)$/, methods: ['PUT'] },
];

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // QR images are fetched by mail clients and PDF renderers — no headers, no auth.
  app.use(qrRouter);

  // Non-spec control surface, deliberately outside /api.
  app.use(express.json({ limit: '1mb' }), devRouter);

  // Auth runs BEFORE the body is parsed, so an unauthorized request with a
  // malformed body is still a 401 — the credential check must not be reachable
  // around by sending rubbish.
  app.use('/api', requireAuth, express.json({ limit: '1mb' }));
  app.use('/api', catalogRouter);
  app.use('/api', ordersRouter);
  app.use('/api', dataUsageRouter);
  app.use('/api', balanceRouter);

  // A path that exists under a different verb is 405, not 404.
  app.use((req, res) => {
    const known = ROUTES.find((route) => route.pattern.test(req.path));
    if (known && !known.methods.includes(req.method)) {
      fail(res, 405, 'Method not allowed');
      return;
    }
    fail(res, 404, `Resource not found, path: ${req.path}`);
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    // Unparseable JSON is the client's mistake, and GoHub calls it this.
    if (error instanceof SyntaxError) {
      fail(res, 400, 'Wrong argument');
      return;
    }
    console.error('[mock-gohub] unhandled error:', error);
    fail(res, 500, 'Internal server error');
  });

  return app;
}
