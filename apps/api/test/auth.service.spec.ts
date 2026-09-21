import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { generateActionToken } from '../src/auth/security.utils.js';

function createService(action: unknown = null) {
  const transactionTokenLookup = vi.fn().mockResolvedValue(null);
  const prisma = {
    membershipActionToken: { findUnique: vi.fn().mockResolvedValue(action) },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ membershipActionToken: { findUnique: transactionTokenLookup } })
    ),
  };

  return {
    prisma,
    service: new AuthService(prisma as never, {} as never, {} as never, {} as never),
  };
}

describe('AuthService password action preflight', () => {
  it('rejects an invalid invitation token before starting the mutation transaction', async () => {
    const { prisma, service } = createService();

    await expect(
      service.acceptInvitation({ token: generateActionToken(), password: 'new secure password' })
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.membershipActionToken.findUnique).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid password-reset token before starting the mutation transaction', async () => {
    const { prisma, service } = createService();

    await expect(
      service.resetPassword({ token: generateActionToken(), password: 'replacement password' })
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.membershipActionToken.findUnique).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a token whose user does not match its membership before any mutation', async () => {
    const { prisma, service } = createService({
      id: 'action-1',
      tenantId: 'tenant-1',
      userId: 'user-2',
      membershipId: 'membership-1',
      type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      revokedAt: null,
      membership: { tenantId: 'tenant-1', userId: 'user-1' },
    });

    await expect(
      service.resetPassword({ token: generateActionToken(), password: 'replacement password' })
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
