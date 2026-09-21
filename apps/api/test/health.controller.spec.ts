import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/health/health.controller.js';

describe('HealthController', () => {
  it('reports liveness without touching the database', () => {
    const database = { $queryRaw: vi.fn() };
    const controller = new HealthController(database as never);

    expect(controller.live()).toMatchObject({ status: 'ok', service: 'pulso-api' });
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness only after the database answers', async () => {
    const database = { $queryRaw: vi.fn().mockResolvedValue([{ ready: 1 }]) };
    const controller = new HealthController(database as never);

    await expect(controller.ready()).resolves.toMatchObject({ status: 'ready' });
    expect(database.$queryRaw).toHaveBeenCalledOnce();
  });

  it('fails readiness when the database is unavailable', async () => {
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) };
    const controller = new HealthController(database as never);

    await expect(controller.ready()).rejects.toMatchObject({ status: 503 });
  });
});
