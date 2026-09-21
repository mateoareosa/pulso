import { describe, expect, it } from 'vitest';
import {
  areSalesAdjustmentsEnabled,
  calculateReturnPlan,
  resolveRefundPolicy,
} from '../src/sales/sales-adjustment.service.js';

describe('sales adjustment policy', () => {
  const saleItems = [
    { id: 'line-a', quantity: '2', unitPriceCents: 1500 },
    { id: 'line-b', quantity: '1', unitPriceCents: 900 },
  ];

  it('calculates a partial return from remaining quantities and prices', () => {
    const plan = calculateReturnPlan(saleItems, [{ saleItemId: 'line-a', quantity: 1 }], {
      'line-a': 0.5,
    });

    expect(plan).toEqual([
      { saleItemId: 'line-a', quantity: 1, unitPriceCents: 1500, totalCents: 1500 },
    ]);
  });

  it('rejects quantities above the remaining returnable amount', () => {
    expect(() =>
      calculateReturnPlan(saleItems, [{ saleItemId: 'line-a', quantity: 1.6 }], {
        'line-a': 0.5,
      })
    ).toThrowError(expect.objectContaining({ code: 'RETURN_QUANTITY_EXCEEDED' }));
  });

  it('completes cash refunds through the cash ledger', () => {
    expect(resolveRefundPolicy([{ type: 'CASH', amountCents: 3900 }])).toEqual({
      tender: 'CASH',
      status: 'COMPLETED',
      requiresCashMovement: true,
    });
  });

  it('marks non-cash refunds pending for manual settlement', () => {
    expect(resolveRefundPolicy([{ type: 'DEBIT', amountCents: 3900 }])).toEqual({
      tender: 'DEBIT',
      status: 'PENDING',
      requiresCashMovement: false,
    });
  });

  it('supports an explicit rollout kill switch without disabling by default', () => {
    expect(areSalesAdjustmentsEnabled(undefined)).toBe(true);
    expect(areSalesAdjustmentsEnabled('true')).toBe(true);
    expect(areSalesAdjustmentsEnabled('false')).toBe(false);
  });
});
