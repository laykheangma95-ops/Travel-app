import { describe, expect, it } from 'vitest';
import { GohubNotFoundError } from '@/lib/gohub/errors';
import { client, pickOrderableItem } from './helpers';

describe('top-up', () => {
  it('accepts a top-up for an ICCID and item', async () => {
    const item = await pickOrderableItem();

    // The response carries no `data`, only a message — the client must treat
    // that as success rather than as a malformed envelope.
    await expect(
      client.createTopup({ iccid: '8985203108005568xx', itemCode: item.code })
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown itemCode', async () => {
    await expect(
      client.createTopup({ iccid: '8985203108005568xx', itemCode: 'NOT_A_REAL_ITEM' })
    ).rejects.toBeInstanceOf(GohubNotFoundError);
  });
});
