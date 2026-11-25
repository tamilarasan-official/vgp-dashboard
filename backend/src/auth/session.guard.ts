import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC, Role, ROLES_KEY, verifySession } from './auth.util';

/**
 * Global guard: every API route needs a valid session token (Authorization: Bearer ...)
 * unless marked @Public(). Users that were deactivated lose access immediately.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header = String(req.headers.authorization ?? '');
    const session = header.startsWith('Bearer ') ? verifySession(header.slice(7)) : null;
    if (!session) throw new UnauthorizedException('Please log in');

    const user = await this.prisma.appUser.findUnique({ where: { id: session.id }, select: { active: true, role: true } });
    if (!user?.active) throw new UnauthorizedException('Account disabled');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && user.role !== 'admin' && !roles.includes(user.role as Role)) {
      throw new ForbiddenException('Not allowed for your role');
    }
    req.user = { id: session.id, email: session.email, name: session.name, role: user.role };
    return true;
  }
}
