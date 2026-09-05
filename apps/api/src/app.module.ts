import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TestResetModule } from './test-utils/test-reset.module.js';

import { APP_GUARD } from '@nestjs/core';
import { OriginValidationGuard } from './auth/origin-validation.guard.js';

const dynamicImports = [
  PrismaModule,
  HealthModule,
  TenantsModule,
  LocationsModule,
  AuthModule,
  SalesModule,
  SyncModule,
  ...(process.env.NODE_ENV === 'test' ? [TestResetModule] : []),
];

@Module({
  imports: dynamicImports,
  providers: [
    {
      provide: APP_GUARD,
      useClass: OriginValidationGuard,
    },
  ],
})
export class AppModule {}
