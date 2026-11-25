import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Records every connector run in sync_run (for "last synced at" and monitoring). */
@Injectable()
export class SyncRunService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T extends { read: number; written: number }>(
    opts: { sourceCode: string; propertyCode?: string; jobType: string; rangeFrom?: Date; rangeTo?: Date },
    work: () => Promise<T>,
  ): Promise<T> {
    const source = await this.prisma.sourceSystem.findUniqueOrThrow({ where: { code: opts.sourceCode } });
    const property = opts.propertyCode
      ? await this.prisma.property.findUnique({ where: { code: opts.propertyCode } })
      : null;
    const run = await this.prisma.syncRun.create({
      data: {
        sourceId: source.id,
        propertyId: property?.id,
        jobType: opts.jobType,
        rangeFrom: opts.rangeFrom,
        rangeTo: opts.rangeTo,
      },
    });
    try {
      const result = await work();
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'success', finishedAt: new Date(), recordsRead: result.read, recordsWritten: result.written },
      });
      return result;
    } catch (e) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'failed', finishedAt: new Date(), error: String((e as Error).message).slice(0, 500) },
      });
      throw e;
    }
  }

  lastSuccess(sourceCode: string) {
    return this.prisma.syncRun.findFirst({
      where: { source: { code: sourceCode }, status: 'success' },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, jobType: true, rangeFrom: true, rangeTo: true },
    });
  }
}
