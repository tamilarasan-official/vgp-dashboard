import { Public } from '../auth/auth.util';
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/health - API and database status, plus each source system's status. */
  @Get()
  async check() {
    const started = Date.now();
    try {
      const [{ now }] = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
      const sources = await this.prisma.sourceSystem.findMany({
        select: { code: true, name: true, status: true },
        orderBy: { id: 'asc' },
      });
      return { status: 'ok', db: 'connected', dbTime: now, latencyMs: Date.now() - started, sources };
    } catch {
      return { status: 'degraded', db: 'unreachable', latencyMs: Date.now() - started };
    }
  }
}
