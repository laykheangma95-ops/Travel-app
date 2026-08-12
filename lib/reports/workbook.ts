// ─────────────────────────────────────────────────────────────────────────────
// Sales statement → .xlsx
//
// Two sheets, because two different people open this file:
//
//   "Statement"  — the vertical P&L a finance person expects. Gross sales, less
//                  discounts, net sales, less COGS, gross profit, margin. Single
//                  rule above a subtotal, double rule under the bottom line,
//                  negatives in parentheses. That is the accounting convention,
//                  and matching it is what makes the file look like a statement
//                  rather than a data dump.
//
//   "By period"  — one row per week or month, so trends are visible and the
//                  numbers can be pivoted.
//
// Money is written as a real number with a currency format, never as a
// pre-formatted string. A string cannot be summed, and the first thing anyone
// does with a spreadsheet is select a column and look at the total.
//
// There is no customer name, email or phone in this file, by design — see the
// header of ./sales.ts.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs';
import { centsToAmount, type SalesPeriodRow, type SalesReport } from './sales';

// Brand — Temple Night / Angkor Gold, as defined in tailwind.config.ts.
const INK = 'FF14263F';
const INK_SOFT = 'FF475569';
const GOLD = 'FFC69749';
const BAND = 'FFF1F5F9';
const RULE = 'FFCBD5E1';

/** Accounting format: thousands separated, negatives in parentheses. */
const MONEY = '#,##0.00;(#,##0.00)';
const INTEGER = '#,##0';
const PERCENT = '0.00%';

const PERIOD_TITLE: Record<SalesReport['period'], string> = {
  weekly: 'Weekly Sales Statement',
  monthly: 'Monthly Sales Statement',
  all: 'Sales Statement — All Time',
};

function bpsToFraction(bps: number | null): number | null {
  return bps === null ? null : bps / 10000;
}

/** Title block shared by both sheets. Returns the next free row. */
function writeHeader(ws: ExcelJS.Worksheet, report: SalesReport, lastColumn: string): number {
  ws.mergeCells(`A1:${lastColumn}1`);
  const title = ws.getCell('A1');
  title.value = 'Domner';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: INK } };
  ws.getRow(1).height = 26;

  ws.mergeCells(`A2:${lastColumn}2`);
  const subtitle = ws.getCell('A2');
  subtitle.value = PERIOD_TITLE[report.period];
  subtitle.font = { name: 'Calibri', size: 12, color: { argb: INK_SOFT } };

  ws.mergeCells(`A3:${lastColumn}3`);
  const meta = ws.getCell('A3');
  const range =
    report.rangeStart || report.rangeEnd
      ? `${report.rangeStart ?? 'start'} to ${report.rangeEnd ?? 'today'}`
      : 'All recorded orders';
  meta.value = `${range}  ·  Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC  ·  USD`;
  meta.font = { name: 'Calibri', size: 9, italic: true, color: { argb: INK_SOFT } };

  // Gold rule under the title block.
  ws.mergeCells(`A4:${lastColumn}4`);
  ws.getRow(4).height = 4;
  ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };

  return 6;
}

function styleColumnHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    cell.border = {
      top: { style: 'thin', color: { argb: RULE } },
      bottom: { style: 'thin', color: { argb: RULE } },
    };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 24;
}

// ── Sheet 1: the statement ───────────────────────────────────────────────────

interface StatementLine {
  label: string;
  cents?: number;
  fraction?: number | null;
  count?: number;
  /** Renders as a subtotal: bold with a rule above. */
  subtotal?: boolean;
  /** Renders as the bottom line: bold with a double rule below. */
  bottomLine?: boolean;
  /** Indented "Less: …" style line. */
  deduction?: boolean;
  spacer?: boolean;
}

function statementLines(total: SalesPeriodRow): StatementLine[] {
  return [
    { label: 'Gross sales', cents: total.grossSalesCents },
    { label: 'Less: discounts', cents: -total.discountsCents, deduction: true },
    { label: 'Net sales', cents: total.netSalesCents, subtotal: true },
    { label: '', spacer: true },
    { label: 'Cost of goods sold', cents: -total.cogsCents, deduction: true },
    { label: 'Gross profit', cents: total.grossProfitCents, subtotal: true },
    { label: 'Gross margin', fraction: bpsToFraction(total.marginBps), bottomLine: true },
    { label: '', spacer: true },
    { label: 'Orders settled', count: total.orders },
    { label: 'Units sold', count: total.unitsSold },
    { label: 'Average order value', cents: total.orders > 0 ? Math.round(total.netSalesCents / total.orders) : 0 },
    { label: '', spacer: true },
    { label: 'Refunds issued', count: total.refunds },
    { label: 'Refunded value', cents: -total.refundsCents, deduction: true },
  ];
}

function writeStatementSheet(wb: ExcelJS.Workbook, report: SalesReport): void {
  const ws = wb.addWorksheet('Statement', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 18;

  let r = writeHeader(ws, report, 'B');

  for (const line of statementLines(report.total)) {
    const row = ws.getRow(r);

    if (line.spacer) {
      row.height = 6;
      r += 1;
      continue;
    }

    const labelCell = row.getCell(1);
    labelCell.value = line.deduction ? `    ${line.label}` : line.label;
    labelCell.font = {
      name: 'Calibri',
      size: 11,
      bold: Boolean(line.subtotal || line.bottomLine),
      color: { argb: line.deduction ? INK_SOFT : INK },
    };

    const valueCell = row.getCell(2);
    if (line.fraction !== undefined) {
      // Null margin means no order in range carried a cost — say so rather than
      // print 0.00%, which reads as "we made nothing" instead of "unknown".
      valueCell.value = line.fraction === null ? 'n/a' : line.fraction;
      if (line.fraction !== null) valueCell.numFmt = PERCENT;
    } else if (line.count !== undefined) {
      valueCell.value = line.count;
      valueCell.numFmt = INTEGER;
    } else {
      valueCell.value = centsToAmount(line.cents ?? 0);
      valueCell.numFmt = MONEY;
    }

    valueCell.font = {
      name: 'Calibri',
      size: 11,
      bold: Boolean(line.subtotal || line.bottomLine),
      color: { argb: INK },
    };
    valueCell.alignment = { horizontal: 'right' };

    if (line.subtotal) {
      valueCell.border = { top: { style: 'thin', color: { argb: INK } } };
    }
    if (line.bottomLine) {
      valueCell.border = { bottom: { style: 'double', color: { argb: INK } } };
    }

    r += 1;
  }

  if (report.hasIncompleteCost) {
    r += 1;
    ws.mergeCells(`A${r}:B${r}`);
    const note = ws.getCell(`A${r}`);
    note.value =
      `Note: ${report.total.ordersMissingCost} settled order(s) have no supplier cost recorded. ` +
      'They are included in sales but excluded from cost of goods sold and margin, ' +
      'so the margin above is calculated only over orders with a known cost.';
    note.font = { name: 'Calibri', size: 9, italic: true, color: { argb: INK_SOFT } };
    note.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = 40;
  }
}

// ── Sheet 2: period breakdown ────────────────────────────────────────────────

const COLUMNS: Array<{
  header: string;
  width: number;
  value: (row: SalesPeriodRow) => number | string | null;
  format?: string;
}> = [
  { header: 'Period', width: 34, value: (r) => r.periodLabel },
  { header: 'Orders', width: 10, value: (r) => r.orders, format: INTEGER },
  { header: 'Units', width: 10, value: (r) => r.unitsSold, format: INTEGER },
  { header: 'Gross sales', width: 14, value: (r) => centsToAmount(r.grossSalesCents), format: MONEY },
  { header: 'Discounts', width: 13, value: (r) => centsToAmount(-r.discountsCents), format: MONEY },
  { header: 'Net sales', width: 14, value: (r) => centsToAmount(r.netSalesCents), format: MONEY },
  { header: 'COGS', width: 13, value: (r) => centsToAmount(-r.cogsCents), format: MONEY },
  { header: 'Gross profit', width: 14, value: (r) => centsToAmount(r.grossProfitCents), format: MONEY },
  {
    header: 'Margin',
    width: 10,
    value: (r) => (r.marginBps === null ? 'n/a' : r.marginBps / 10000),
    format: PERCENT,
  },
  {
    header: 'AOV',
    width: 12,
    value: (r) => centsToAmount(r.orders > 0 ? Math.round(r.netSalesCents / r.orders) : 0),
    format: MONEY,
  },
  { header: 'Refunds', width: 10, value: (r) => r.refunds, format: INTEGER },
  { header: 'Refunded', width: 13, value: (r) => centsToAmount(-r.refundsCents), format: MONEY },
  { header: 'Cost missing', width: 12, value: (r) => r.ordersMissingCost, format: INTEGER },
];

function writePeriodSheet(wb: ExcelJS.Workbook, report: SalesReport): void {
  const ws = wb.addWorksheet('By period', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  COLUMNS.forEach((column, i) => {
    ws.getColumn(i + 1).width = column.width;
  });

  const headerRowNumber = writeHeader(ws, report, 'M');

  const header = ws.getRow(headerRowNumber);
  COLUMNS.forEach((column, i) => {
    header.getCell(i + 1).value = column.header;
  });
  styleColumnHeader(header);

  // Freeze everything above and including the header, so the columns stay
  // labelled once the reader scrolls into a long list of weeks.
  ws.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];

  let r = headerRowNumber + 1;

  for (const dataRow of report.rows) {
    const row = ws.getRow(r);
    COLUMNS.forEach((column, i) => {
      const cell = row.getCell(i + 1);
      const value = column.value(dataRow);
      cell.value = value;
      if (column.format && typeof value === 'number') cell.numFmt = column.format;
      cell.font = { name: 'Calibri', size: 10, color: { argb: INK } };
      if (i > 0) cell.alignment = { horizontal: 'right' };
    });
    // Zebra banding, so a wide row is readable across 13 columns.
    if ((r - headerRowNumber) % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      });
    }
    r += 1;
  }

  // Total row — single rule above, double rule below.
  const totalRow = ws.getRow(r);
  COLUMNS.forEach((column, i) => {
    const cell = totalRow.getCell(i + 1);
    const value = i === 0 ? 'Total' : column.value(report.total);
    cell.value = value;
    if (column.format && typeof value === 'number') cell.numFmt = column.format;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } };
    cell.border = {
      top: { style: 'thin', color: { argb: INK } },
      bottom: { style: 'double', color: { argb: INK } },
    };
    if (i > 0) cell.alignment = { horizontal: 'right' };
  });

  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: COLUMNS.length },
  };
}

/** Renders the report as an .xlsx buffer. */
export async function renderSalesWorkbook(report: SalesReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Domner';
  wb.created = new Date();

  writeStatementSheet(wb, report);
  writePeriodSheet(wb, report);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Stable, sortable download name: domner-sales-monthly-2026-08-12.xlsx */
export function workbookFilename(report: SalesReport): string {
  return `domner-sales-${report.period}-${report.generatedAt.slice(0, 10)}.xlsx`;
}
