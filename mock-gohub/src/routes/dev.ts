// ─────────────────────────────────────────────────────────────────────────────
// Non-spec control surface. Nothing under /dev exists on the real API, and no
// production code may call it — it is mounted outside /api and outside the auth
// middleware so it is obvious at a glance which routes are real.
//
// The contract tests use these to set up scenarios (drop the balance to force
// an insufficient-balance failure, point webhooks at a test receiver). When the
// suite runs against real staging, /dev is absent and those tests skip.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { config } from '../config';
import { state } from '../state';

export const devRouter: Router = Router();

/** Advertises that this is a mock, so the contract suite knows it may set up state. */
devRouter.get('/dev/capabilities', (_req, res) => {
  res.json({
    mock: true,
    fulfilDelayMs: config.fulfilDelayMs,
    slowFulfilDelayMs: config.slowFulfilDelayMs,
    webhookDuplicate: config.webhookDuplicate,
    webhookUrl: state.webhookUrl ?? config.webhookUrl,
  });
});

/** Set the balance. `{ "balance": 0 }` makes the next confirmation fail. */
devRouter.post('/dev/balance', (req, res) => {
  const body = req.body as { balance?: unknown } | undefined;
  const balance = Number(body?.balance);

  if (!Number.isFinite(balance) || balance < 0) {
    res.status(400).json({ statusCode: 400, message: 'balance must be a number >= 0' });
    return;
  }

  state.balance = balance;
  state.save();
  res.json({ statusCode: 200, message: 'Balance updated', data: { balance: String(balance) } });
});

/** Redirect webhooks at a test receiver. Pass `null` to restore the default. */
devRouter.post('/dev/webhook-url', (req, res) => {
  const body = req.body as { url?: unknown } | undefined;
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : null;

  state.webhookUrl = url;
  state.save();
  res.json({ statusCode: 200, message: 'Webhook URL updated', data: { url: url ?? config.webhookUrl } });
});

/**
 * Tune timings at runtime. The contract suite drops the fulfilment delay to a
 * few hundred milliseconds so the webhook tests do not take half a minute each.
 */
devRouter.post('/dev/config', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  for (const key of ['fulfilDelayMs', 'slowFulfilDelayMs', 'createdStatusRate'] as const) {
    const value = Number(body[key]);
    if (body[key] !== undefined && Number.isFinite(value) && value >= 0) {
      config[key] = value;
    }
  }

  res.json({
    statusCode: 200,
    message: 'Config updated',
    data: {
      fulfilDelayMs: config.fulfilDelayMs,
      slowFulfilDelayMs: config.slowFulfilDelayMs,
      createdStatusRate: config.createdStatusRate,
    },
  });
});

/** Wipe orders, ICCIDs and balance back to the starting state. */
devRouter.post('/dev/reset', (req, res) => {
  const body = req.body as { balance?: unknown } | undefined;
  const balance = Number.isFinite(Number(body?.balance))
    ? Number(body?.balance)
    : config.startingBalance;

  state.reset(balance);
  res.json({ statusCode: 200, message: 'State reset', data: { balance: String(state.balance) } });
});
