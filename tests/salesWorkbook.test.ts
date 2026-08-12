import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReport } from '@/lib/reports/sales';
import { renderSalesWorkbook, workbookFilename } from '@/lib/reports/workbook';

// A smoke test that the workbook is a real, openable .xlsx with the numbers in
// the cells — not a plausible-looking buffer. The failure this catches is the
// one that only shows up when someone double-clicks the download.

type Order = Parameters<typeof buildReport>[0][number];

function order(partial: Partial<Order> = {}): Order {
  return {
    status: 'paid',
    price_usd: 25.99,
    subtotal_usd: 25.99,
    discount_usd: 0,
    cost_usd: 15.5,
    created_at: '2026-08-12T10:00:00Z',
    paid_at: '2026-08-12T10:00:00Z',
    items: [{ quantity: 1 }],
    ...partial,
  } as Order;
}

async function reopen(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // Buffer is an acceptable ArrayBuffer-alike for exceljs's loader.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('renderSalesWorkbook', () => {
  it('produces a file that opens, with both sheets present', async () => {
    const report = buildReport([order()], 'monthly');
    const wb = await reopen(await renderSalesWorkbook(report));

    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['Statement', 'By period']);
  });

  it('starts with the ZIP magic bytes of a real xlsx', async () => {
    const buffer = await renderSalesWorkbook(buildReport([order()], 'all'));

    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('writes money as numbers, not strings, so columns can be summed', async () => {
    const report = buildReport([order({ price_usd: 25.99, cost_usd: 15.5 })], 'all');
    const wb = await reopen(await renderSalesWorkbook(report));
    const statement = wb.getWorksheet('Statement')!;

    const values: number[] = [];
    statement.eachRow((row) => {
      const cell = row.getCell(2).value;
      if (typeof cell === 'number') values.push(cell);
    });

    expect(values).toContain(25.99); // net sales
    expect(values).toContain(-15.5); // COGS, shown as a deduction
    expect(values).toContain(10.49); // gross profit
  });

  it('carries the period breakdown with a total row', async () => {
    const report = buildReport(
      [
        order({ paid_at: '2026-08-12T10:00:00Z' }),
        order({ paid_at: '2026-07-12T10:00:00Z' }),
      ],
      'monthly'
    );
    const wb = await reopen(await renderSalesWorkbook(report));
    const sheet = wb.getWorksheet('By period')!;

    const labels: string[] = [];
    sheet.eachRow((row) => {
      const value = row.getCell(1).value;
      if (typeof value === 'string') labels.push(value);
    });

    expect(labels).toContain('Total');
    expect(labels.some((label) => label.includes('Aug 2026'))).toBe(true);
    expect(labels.some((label) => label.includes('Jul 2026'))).toBe(true);
  });

  it('footnotes the file when some orders had no cost recorded', async () => {
    const report = buildReport([order({ cost_usd: null })], 'all');
    const wb = await reopen(await renderSalesWorkbook(report));
    const statement = wb.getWorksheet('Statement')!;

    let note = '';
    statement.eachRow((row) => {
      const value = row.getCell(1).value;
      if (typeof value === 'string' && value.startsWith('Note:')) note = value;
    });

    expect(note).toContain('no supplier cost recorded');
    expect(note).toContain('excluded from cost of goods sold');
  });

  it('shows an unknown margin as n/a rather than 0%', async () => {
    const report = buildReport([order({ cost_usd: null })], 'all');
    const wb = await reopen(await renderSalesWorkbook(report));
    const statement = wb.getWorksheet('Statement')!;

    let marginCell: ExcelJS.CellValue = null;
    statement.eachRow((row) => {
      if (row.getCell(1).value === 'Gross margin') marginCell = row.getCell(2).value;
    });

    expect(marginCell).toBe('n/a');
  });

  it('names the file by period and date', () => {
    const report = buildReport([order()], 'weekly');
    expect(workbookFilename(report)).toMatch(/^domner-sales-weekly-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
