import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Role, SessionUser, signSession, verifyPassword } from './auth.util';

// Simple in-memory throttle: max 10 failed logins per email per 15 minutes.
const failures = new Map<string, { count: number; until: number }>();

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /api/auth/login { email, password } -> { token, expiresAt, user } */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email?: string; password?: string }) {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const f = failures.get(email);
    if (f && f.count >= 10 && Date.now() < f.until) throw new UnauthorizedException('Too many attempts. Try again in 15 minutes.');

    const user = email ? await this.prisma.appUser.findUnique({ where: { email } }) : null;
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      const cur = f && Date.now() < f.until ? f : { count: 0, until: Date.now() + 15 * 60_000 };
      failures.set(email, { count: cur.count + 1, until: cur.until });
      throw new UnauthorizedException('Wrong email or password');
    }
    failures.delete(email);
    await this.prisma.appUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role as Role };
    const { token, expiresAt } = signSession(sessionUser);
    return { token, expiresAt, user: sessionUser };
  }

  /** GET /api/auth/me - the logged-in user. */
  @Get('me')
  me(@Req() req: { user: SessionUser }) {
    return req.user;
  }
}
