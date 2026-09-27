import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import type { UserRoleName } from '../../users';
import { SessionService } from '../application/session.service';
import { hasRequiredRole } from '../domain/auth.types';
import type { AuthenticatedPrincipal } from '../domain/auth.types';

export type AuthenticatedRequest = Request & {
  principal?: AuthenticatedPrincipal;
};
const ROLE_METADATA = 'auth:roles';
export const RequireRoles = (...roles: UserRoleName[]) =>
  SetMetadata(ROLE_METADATA, roles);
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal)
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    return principal;
  },
);
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !/^Bearer [A-Za-z0-9_.-]{1,4096}$/.test(header))
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    req.principal = await this.sessions.authenticate(header.slice(7));
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<UserRoleName[]>(ROLE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal)
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    if (!hasRequiredRole(principal.roles, required))
      throw new ApiException(403, 'FORBIDDEN', 'Insufficient permissions');
    return true;
  }
}
@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET') return true;
    if (
      req.headers.origin !== this.config.webUrl ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new ApiException(
        403,
        'ORIGIN_NOT_ALLOWED',
        'Request origin is not allowed',
      );
    return true;
  }
}
