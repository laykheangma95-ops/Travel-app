import type { Response } from 'express';

/** Every GoHub response, success or failure, is wrapped in this. */
export interface Envelope<T> {
  statusCode: number;
  message: string;
  data?: T;
  pagination?: Pagination;
}

export interface Pagination {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  count: number;
}

const DEFAULT_PER_PAGE = 20;

export function ok<T>(res: Response, data: T, message = 'Success', httpStatus = 200): Response {
  return res.status(httpStatus).json({ statusCode: 200, message, data });
}

export function fail(res: Response, statusCode: number, message: string): Response {
  return res.status(statusCode).json({ statusCode, message });
}

/** Slices a list and returns it with the pagination block list endpoints carry. */
export function paginated<T>(
  res: Response,
  rows: T[],
  query: Record<string, unknown>,
  message = 'Success'
): Response {
  const page = Math.max(1, toInt(query.page, 1));
  const perPage = Math.max(1, toInt(query.perPage, DEFAULT_PER_PAGE));
  const total = rows.length;
  const start = (page - 1) * perPage;
  const slice = rows.slice(start, start + perPage);

  return res.status(200).json({
    statusCode: 200,
    message,
    data: slice,
    pagination: {
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      count: slice.length,
    },
  });
}

function toInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
