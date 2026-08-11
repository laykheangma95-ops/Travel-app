// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders/data-usage/{iccid}
//
// Seven documented state combinations, all reachable with ?forceCase=.
//
// Two of them — 3.1 and 4.2 — return a completely zeroed package for an eSIM
// that is working fine. The telco simply did not answer. Rendering those zeros
// tells a customer in a foreign country that their data is gone, which is both
// wrong and the kind of thing that produces a refund request. The client turns
// them into `usageAvailable: false` instead; see lib/gohub/normalize.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { Router } from 'express';
import { fail, ok } from '../envelope';
import { addDays } from '../ids';
import { state } from '../state';
import type { WireDataUsage, WireUsagePackage } from '../types';

export const dataUsageRouter: Router = Router();

export const FORCE_CASES = ['1.0', '2.0', '3.0', '3.1', '4.0', '4.1', '4.2'] as const;
export type ForceCase = (typeof FORCE_CASES)[number];

dataUsageRouter.get('/orders/data-usage/:iccid', (req, res) => {
  const iccid = req.params.iccid!;

  // Magic prefix: some ICCID ranges simply have no capacity API behind them.
  if (iccid.startsWith('unsupported_')) {
    return fail(res, 422, 'This ICCID is not supported for capacity lookup');
  }

  const forced = req.query.forceCase;
  const forceCase =
    typeof forced === 'string' && (FORCE_CASES as readonly string[]).includes(forced)
      ? (forced as ForceCase)
      : null;

  const record = state.iccids.get(iccid);
  // A forced case is a test instruction, so it works for an ICCID we have never
  // issued. Without one, an unknown ICCID is a genuine 404.
  if (!record && !forceCase) {
    return fail(res, 404, `Resource not found, iccid: ${iccid}`);
  }

  const packageName = record?.itemName ?? 'Data package';
  const validityDays = record?.activationValidityDays ?? 30;
  const orderedAt = record?.orderedAt ?? new Date().toISOString();
  const expiry = record?.activationExpiryDate ?? addDays(new Date(orderedAt), validityDays);

  const chosen = forceCase ?? defaultCaseFor(iccid);

  return ok(
    res,
    build(chosen, { iccid, packageName, orderedAt, expiry }),
    'Get data usage successfully'
  );
});

interface Context {
  iccid: string;
  packageName: string;
  orderedAt: string;
  expiry: string;
}

/** Stable per ICCID, so repeated polling of the same eSIM does not flap. */
function defaultCaseFor(iccid: string): ForceCase {
  const digest = createHash('sha256').update(iccid).digest()[0]!;
  // Weighted towards the healthy case, with the awkward ones still reachable.
  if (digest % 10 === 0) return '3.0';
  if (digest % 10 === 1) return '4.1';
  if (digest % 10 === 2) return '4.2';
  return '4.0';
}

function zeroedPackage(
  ctx: Context,
  status: WireUsagePackage['status'],
  dates: { start: string | null; end: string | null }
): WireUsagePackage {
  return {
    id: packageId(ctx.iccid),
    name: ctx.packageName,
    status,
    startDate: dates.start,
    endDate: dates.end,
    remain: 0,
    amount: 0,
    thresholdLimit: 0,
    grantAmount: 0,
    unit: 'megabytes',
  };
}

function build(forceCase: ForceCase, ctx: Context): WireDataUsage {
  const activatedAt = ctx.orderedAt;
  const endDate = ctx.expiry;

  switch (forceCase) {
    // 1.0 — the plan ran its course. Everything zeroed, and correctly so.
    case '1.0':
      return {
        iccid: ctx.iccid,
        status: 'EXPIRED',
        activatedAt,
        activationExpiryDate: endDate,
        packages: [zeroedPackage(ctx, 'UNAVAILABLE', { start: activatedAt, end: endDate })],
      };

    // 2.0 — the telco knows nothing about this ICCID at all.
    case '2.0':
      return {
        iccid: ctx.iccid,
        status: 'UNAVAILABLE',
        activatedAt: null,
        activationExpiryDate: null,
        packages: [zeroedPackage(ctx, 'UNAVAILABLE', { start: null, end: null })],
      };

    // 3.0 — bought, not yet installed. Null dates are correct here.
    case '3.0':
      return {
        iccid: ctx.iccid,
        status: 'PREACTIVE',
        activatedAt: null,
        activationExpiryDate: ctx.expiry,
        packages: [
          {
            ...zeroedPackage(ctx, 'PREACTIVE', { start: null, end: null }),
            grantAmount: 0,
            unit: 'gigabytes',
          },
        ],
      };

    // 3.1 — not yet installed AND the telco returned nothing. The zeros here
    // are noise, not a reading.
    case '3.1':
      return {
        iccid: ctx.iccid,
        status: 'PREACTIVE',
        activatedAt: null,
        activationExpiryDate: ctx.expiry,
        packages: [zeroedPackage(ctx, 'UNAVAILABLE', { start: null, end: null })],
      };

    // 4.0 — the healthy case. Note the float: GoHub passes the telco's raw
    // double straight through, so 16.980000000000018 is a real value.
    case '4.0': {
      const grant = 1024;
      const used = 16.980000000000018;
      return {
        iccid: ctx.iccid,
        status: 'ACTIVE',
        activatedAt,
        activationExpiryDate: endDate,
        packages: [
          {
            id: packageId(ctx.iccid),
            name: ctx.packageName,
            status: 'ACTIVE',
            startDate: activatedAt,
            endDate,
            remain: grant - used,
            amount: used,
            thresholdLimit: grant,
            grantAmount: grant,
            unit: 'megabytes',
          },
        ],
      };
    }

    // 4.1 — line is up, this package has not started yet (common on multi-day
    // daily plans between allowance resets).
    case '4.1':
      return {
        iccid: ctx.iccid,
        status: 'ACTIVE',
        activatedAt,
        activationExpiryDate: endDate,
        packages: [
          {
            ...zeroedPackage(ctx, 'PREACTIVE', { start: null, end: endDate }),
            grantAmount: 1024,
            thresholdLimit: 1024,
            remain: 1024,
          },
        ],
      };

    // 4.2 — line is definitely up, telco returned nothing. The dangerous one.
    case '4.2':
      return {
        iccid: ctx.iccid,
        status: 'ACTIVE',
        activatedAt,
        activationExpiryDate: endDate,
        packages: [zeroedPackage(ctx, 'UNAVAILABLE', { start: activatedAt, end: endDate })],
      };
  }
}

function packageId(iccid: string): string {
  return createHash('sha256').update(`package:${iccid}`).digest('hex').slice(0, 16);
}
