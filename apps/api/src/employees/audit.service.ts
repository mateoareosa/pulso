import { Inject, Injectable } from '@nestjs/common';
import type { EmployeeAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EmployeeAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async append(
    client: Prisma.TransactionClient,
    input: {
      tenantId: string;
      actorUserId: string;
      targetMembershipId: string;
      action: EmployeeAuditAction;
      metadata: Prisma.InputJsonValue;
    }
  ): Promise<void> {
    await client.employeeAuditEvent.create({ data: input });
  }

  async list(tenantId: string) {
    const events = await this.prisma.employeeAuditEvent.findMany({
      where: { tenantId },
      include: {
        actor: { select: { id: true, email: true, name: true } },
        targetMembership: { include: { user: { select: { email: true, name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return events.map((event) => ({
      id: event.id,
      actor: event.actor,
      target: { id: event.targetMembershipId, ...event.targetMembership.user },
      action: event.action,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    }));
  }
}
