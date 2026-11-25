import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/** Protects manual admin endpoints (e.g. backfill) with the x-admin-key header. */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY ?? '';
    const given = String(context.switchToHttp().getRequest().headers['x-admin-key'] ?? '');
    const ok =
      expected.length > 0 &&
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) throw new UnauthorizedException('Invalid admin key');
    return true;
  }
}
