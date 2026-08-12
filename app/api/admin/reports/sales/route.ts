// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/reports/sales?period=weekly|monthly|all&from=&to=
//
// Streams a formatted .xlsx sales statement.
//
// SCOPE, DELIBERATELY: this endpoint reads money columns and nothing else. It
// cannot return a customer name, email or phone, because the query in
// lib/reports/sales.ts never selects them. docs/LOCKED.md names "a CSV export"
// as the realistic way the customer contact dataset leaks, so the export that
// exists is the one that has no contact data in it to leak.
//
// Every download is logged with the admin's identity — an export is a
// deliberate act and the audit trail should show who took one.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { ApiError, route } from '@/lib/http';
import { requirePermission } from '@/lib/serverAuth';
import { buildSalesReport, type ReportPeriod } from '@/lib/reports/sales';
import { renderSalesWorkbook, workbookFilename } from '@/lib/reports/workbook';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERIODS: ReportPeriod[] = ['weekly', 'monthly', 'all'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: string | null, field: string): string | undefined {
  if (!value) return undefined;
  if (!ISO_DATE.test(value)) {
    throw new ApiError('BAD_REQUEST', `${field} must be a date in YYYY-MM-DD form.`);
  }
  return value;
}

export const GET = route(
  async (request) => {
    const { user: admin } = await requirePermission(request, 'reports.export');

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('period') ?? 'monthly';

    if (!(PERIODS as string[]).includes(requested)) {
      throw new ApiError('BAD_REQUEST', 'period must be weekly, monthly or all.');
    }

    const from = readDate(searchParams.get('from'), 'from');
    const to = readDate(searchParams.get('to'), 'to');

    if (from && to && from > to) {
      throw new ApiError('BAD_REQUEST', 'The start date must not be after the end date.');
    }

    const report = await buildSalesReport({ period: requested as ReportPeriod, from, to });
    const workbook = await renderSalesWorkbook(report);
    const filename = workbookFilename(report);

    log.info('admin.report_exported', {
      actor: admin.email ?? admin.id,
      period: report.period,
      from: from ?? null,
      to: to ?? null,
      periods: report.rows.length,
      orders: report.total.orders,
      bytes: workbook.byteLength,
    });

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(workbook.byteLength),
        // A financial export must never sit in a shared or browser cache.
        'Cache-Control': 'no-store, private',
      },
    });
  },
  { rateLimit: 'auth', name: 'admin.reports.sales' }
);
