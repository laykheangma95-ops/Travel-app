import { Router } from 'express';
import { ok } from '../envelope';
import { state } from '../state';

export const balanceRouter: Router = Router();

/**
 * `data` is an ARRAY containing one object, not the object. That is what the
 * spec says and what the API does, so a client that reads `data.balance` gets
 * `undefined` and cheerfully decides we have no money. Reproduced on purpose.
 *
 * The balance itself is a string, like every other number GoHub sends.
 */
balanceRouter.get('/balance', (_req, res) => {
  ok(res, [{ balance: String(state.balance), currencyCode: 'VND' }], 'Get balance successfully');
});
