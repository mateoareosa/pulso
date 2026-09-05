import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { AuthController } from './auth.controller.js';
import { SessionAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { OriginValidationGuard } from './origin-validation.guard.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { LocationsModule } from '../locations/locations.module.js';

@Global()
@Module({
  imports: [TenantsModule, LocationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    RateLimiterService,
    SessionAuthGuard,
    RolesGuard,
    OriginValidationGuard,
  ],
  exports: [AuthService, SessionService, RateLimiterService, SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
