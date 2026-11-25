import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticates on-site agents. AGENT_TOKENS = "agentId:token,agentId2:token2".
 * Agent sends: Authorization: Bearer <token>. The matching agentId is attached to the request.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const given = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    const pairs = (process.env.AGENT_TOKENS ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf(':');
        return { id: p.slice(0, i), token: p.slice(i + 1) };
      });
    const match = pairs.find(
      (p) => p.token.length > 0 && p.token.length === given.length && timingSafeEqual(Buffer.from(p.token), Buffer.from(given)),
    );
    if (!match) throw new UnauthorizedException('Invalid agent token');
    req.agentId = match.id;
    return true;
  }
}
