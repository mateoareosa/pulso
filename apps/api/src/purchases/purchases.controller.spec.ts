import { BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SessionContext } from '../auth/cookie.utils.js';
import { PurchasesController } from './purchases.controller.js';
import type { PurchasesService } from './purchases.service.js';

const session = {
  tenantId: 'tenant-a',
  locationId: 'location-a',
} as SessionContext;

function createSubject() {
  const updateDraft = vi.fn().mockResolvedValue({ id: 'purchase-a', version: 1 });
  const service = { updateDraft } as unknown as PurchasesService;
  return { controller: new PurchasesController(service), updateDraft };
}

describe('PurchasesController update concurrency precondition', () => {
  it('returns 428 and never calls the service when If-Match is missing', async () => {
    const { controller, updateDraft } = createSubject();

    await expect(
      controller.updateDraft('purchase-a', { discountCents: 10 }, session, undefined)
    ).rejects.toMatchObject({ status: 428 });
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['empty', ''],
    ['quoted', '"0"'],
    ['weak', 'W/"0"'],
    ['repeated', ['0', '1']],
    ['comma-joined', '0, 1'],
    ['negative', '-1'],
    ['signed', '+1'],
    ['fractional', '1.0'],
    ['non-canonical leading zero', '01'],
    ['surrounded by whitespace', ' 1'],
    ['unsafe', '9007199254740992'],
  ])('returns 400 and never calls the service for %s If-Match', async (_case, header) => {
    const { controller, updateDraft } = createSubject();

    await expect(
      controller.updateDraft('purchase-a', { discountCents: 10 }, session, header)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['0', 0],
    ['1', 1],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])(
    'passes canonical If-Match %s as the exact expectedVersion',
    async (header, expectedVersion) => {
      const { controller, updateDraft } = createSubject();
      const body = { discountCents: 10 };

      await controller.updateDraft('purchase-a', body, session, header);

      expect(updateDraft).toHaveBeenCalledWith('purchase-a', body, expectedVersion, session);
    }
  );

  it('keeps version out of the strict update body contract', async () => {
    const { controller, updateDraft } = createSubject();

    await expect(
      controller.updateDraft('purchase-a', { discountCents: 10, version: 0 }, session, '0')
    ).rejects.toBeInstanceOf(HttpException);
    expect(updateDraft).not.toHaveBeenCalled();
  });
});
