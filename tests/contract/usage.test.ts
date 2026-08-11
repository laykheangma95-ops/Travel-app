import { describe, expect, it } from 'vitest';
import { GohubNotFoundError, GohubValidationError } from '@/lib/gohub/errors';
import { client, isMock } from './helpers';

// Any ICCID works with ?forceCase — the parameter is the instruction, not a lookup.
const ICCID = '8985203108005568xx';

describe('data usage', () => {
  it('reports real numbers for ACTIVE / ACTIVE (4.0)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '4.0' });

    expect(usage.status).toBe('ACTIVE');
    expect(usage.usageAvailable).toBe(true);
    if (!usage.usageAvailable) return;

    expect(usage.grantedMb).toBeGreaterThan(0);
    // The telco sends raw doubles: 16.980000000000018. Rounding is the UI's job.
    expect(usage.usedMb).toBeGreaterThan(0);
    expect(usage.remainingMb).toBeGreaterThan(0);
    expect(usage.remainingMb).toBeLessThanOrEqual(usage.grantedMb);
  });

  it('reports zeros honestly for EXPIRED / UNAVAILABLE (1.0)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '1.0' });

    // Expired is a real answer, so zeros here are true and may be shown.
    expect(usage.status).toBe('EXPIRED');
    expect(usage.packages[0]!.status).toBe('UNAVAILABLE');
    expect(usage.packages[0]!.remainingMb).toBe(0);
  });

  it('reports usage as unavailable for UNAVAILABLE / UNAVAILABLE (2.0)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '2.0' });

    expect(usage.status).toBe('UNAVAILABLE');
    expect(usage.usageAvailable).toBe(false);
  });

  it('handles PREACTIVE / PREACTIVE (3.0) with null dates', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '3.0' });

    expect(usage.status).toBe('PREACTIVE');
    expect(usage.packages[0]!.status).toBe('PREACTIVE');
    // Not installed yet — there is no start or end date, and that is correct.
    expect(usage.packages[0]!.startDate).toBeNull();
    expect(usage.packages[0]!.endDate).toBeNull();
    expect(usage.activatedAt).toBeNull();
  });

  it('never reports zeros as usage for PREACTIVE / UNAVAILABLE (3.1)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '3.1' });

    expect(usage.status).toBe('PREACTIVE');
    // The telco returned nothing. Rendering "0 MB remaining" from this tells a
    // customer their eSIM is empty when it has not even been installed.
    expect(usage.usageAvailable).toBe(false);
    expect(usage).not.toHaveProperty('remainingMb');
  });

  it('handles ACTIVE / PREACTIVE (4.1)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '4.1' });

    expect(usage.status).toBe('ACTIVE');
    expect(usage.packages[0]!.status).toBe('PREACTIVE');
    expect(usage.usageAvailable).toBe(true);
  });

  it('never reports zeros as usage for ACTIVE / UNAVAILABLE (4.2)', async ({ skip }) => {
    if (!(await isMock())) return skip();

    const usage = await client.getDataUsage(ICCID, { forceCase: '4.2' });

    // The eSIM is live and working. The zeros are the telco not answering.
    // This is the case that produces refund requests if we render it.
    expect(usage.status).toBe('ACTIVE');
    expect(usage.usageAvailable).toBe(false);
    expect(usage).not.toHaveProperty('remainingMb');
  });

  it('normalizes every unit to megabytes', async ({ skip }) => {
    if (!(await isMock())) return skip();

    for (const forceCase of ['1.0', '2.0', '3.0', '3.1', '4.0', '4.1', '4.2']) {
      const usage = await client.getDataUsage(ICCID, { forceCase });

      expect(usage.iccid).toBe(ICCID);
      for (const pkg of usage.packages) {
        expect(Number.isFinite(pkg.usedMb)).toBe(true);
        expect(Number.isFinite(pkg.remainingMb)).toBe(true);
        expect(Number.isFinite(pkg.grantedMb)).toBe(true);
      }
    }
  });

  it('returns 404 for an unknown ICCID', async () => {
    await expect(client.getDataUsage('8999999999999999999')).rejects.toBeInstanceOf(
      GohubNotFoundError
    );
  });

  it('returns 422 for an ICCID with no capacity API', async ({ skip }) => {
    if (!(await isMock())) return skip();

    await expect(client.getDataUsage('unsupported_0001')).rejects.toBeInstanceOf(
      GohubValidationError
    );
  });
});
