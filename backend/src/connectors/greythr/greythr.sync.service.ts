import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';
import { addDays, dateRange, istToday, toDbDate } from '../../common/ist-date';
import { GreythrClient } from './greythr.client';

type Row = Record<string, any>;

const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? toDbDate(v.slice(0, 10)) : null);
/** greytHR sends IST local time without offset. */
const istTime = (v: unknown) => (typeof v === 'string' && v.length >= 16 ? new Date(`${v.slice(0, 19)}+05:30`) : null);
const minutes = (v: unknown) => {
  const m = typeof v === 'string' ? /^(-?\d+):(\d{2})/.exec(v) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return h * 60 + (m[1].startsWith('-') ? -1 : 1) * Number(m[2]);
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

@Injectable()
export class GreythrSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GreythrSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: GreythrClient,
    private readonly runs: SyncRunService,
  ) {}

  /** On start-up: fill any days missed while the server was off (max 92 days). */
  onApplicationBootstrap() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured()) return;
    setTimeout(async () => {
      try {
        const last = await this.prisma.hrAttendanceDay.aggregate({ _max: { date: true } });
        const today = istToday();
        let from = last._max.date ? addDays(last._max.date.toISOString().slice(0, 10), -1) : addDays(today, -6);
        if (from < addDays(today, -91)) from = addDays(today, -91);
        if (from < today && !this.running) await this.sync(from, today, 'catch-up');
      } catch (e) {
        this.logger.error(`greytHR catch-up failed: ${(e as Error).message}`);
      }
    }, 20_000);
  }

  /** Hourly: employees + last 2 days of attendance (greytHR processes attendance through the day). */
  @Cron('10 * * * *', { name: 'greythr-hourly', timeZone: 'Asia/Kolkata' })
  async hourly() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured() || this.running) return;
    const t = istToday();
    await this.sync(addDays(t, -1), t, 'incremental').catch((e) => this.logger.error(`greytHR hourly sync failed: ${e.message}`));
  }

  /** Nightly 03:15 IST: re-check the last 7 days (regularisations, late approvals). */
  @Cron('15 3 * * *', { name: 'greythr-nightly', timeZone: 'Asia/Kolkata' })
  async nightly() {
    if (process.env.SYNC_ENABLED !== 'true' || !this.client.isConfigured() || this.running) return;
    const t = istToday();
    await this.sync(addDays(t, -7), addDays(t, -1), 'nightly').catch((e) => this.logger.error(`greytHR nightly sync failed: ${e.message}`));
  }

  async sync(from: string, to: string, jobType = 'manual') {
    if (this.running) throw new Error('A greytHR sync is already running');
    this.running = true;
    try {
      return await this.runs.run({ sourceCode: 'greythr', jobType, rangeFrom: toDbDate(from), rangeTo: toDbDate(to) }, async () => {
        const employees = await this.syncEmployees();
        let attendance = 0;
        // Muster in 7-day chunks; late-in / early-out per day from insights.
        for (let s = from; s <= to; s = addDays(s, 7)) {
          const e = addDays(s, 6) < to ? addDays(s, 6) : to;
          attendance += await this.syncAttendance(s, e);
        }
        await this.prisma.sourceSystem.update({ where: { code: 'greythr' }, data: { status: 'live' } });
        this.logger.log(`greytHR ${jobType} ${from}..${to}: ${employees} employees, ${attendance} attendance rows`);
        return { from, to, employees, attendance, read: employees + attendance, written: employees + attendance };
      });
    } finally {
      this.running = false;
    }
  }

  private async syncEmployees(): Promise<number> {
    const [emps, cats] = await Promise.all([
      this.client.all<Row>('/employee/v2/employees'),
      this.client.all<Row>('/employee/v2/employees/categories'),
    ]);
    // Only work fields are kept: no name, email, mobile, date of birth.
    const empRows: Prisma.HrEmployeeCreateManyInput[] = emps.map((e) => ({
      id: Number(e.employeeId),
      employeeNo: String(e.employeeNo ?? ''),
      dateOfJoin: day(e.dateOfJoin),
      leavingDate: day(e.leavingDate),
      leftOrg: e.leftorg === true,
      status: e.status == null ? null : Number(e.status),
      lastModified: e.lastModified ? new Date(e.lastModified) : null,
    }));
    const catRows: Prisma.HrEmployeeCategoryCreateManyInput[] = cats.flatMap((r) =>
      (r.categoryList ?? []).map((c: Row) => ({
        id: Number(c.id),
        employeeId: Number(r.employeeId),
        categoryType: Number(c.category),
        valueId: Number(c.value),
        effectiveFrom: day(c.effectiveFrom),
        effectiveTo: day(c.effectiveTo),
      })),
    );
    await this.prisma.$transaction(
      [
        this.prisma.hrEmployee.deleteMany({}),
        this.prisma.hrEmployee.createMany({ data: empRows }),
        this.prisma.hrEmployeeCategory.deleteMany({}),
        this.prisma.hrEmployeeCategory.createMany({ data: catRows, skipDuplicates: true }),
      ],
    );
    return empRows.length;
  }

  private async syncAttendance(from: string, to: string): Promise<number> {
    const muster = await this.client.all<Row>(`/attendance/v2/employee/muster?start=${from}&end=${to}&summary=true`);
    // Per-day late-in / early-out flags.
    const late = new Set<string>();
    const early = new Set<string>();
    for (const d of dateRange(from, to)) {
      const ins = await this.client.all<Row>(`/attendance/v2/employee/insights?start=${d}&end=${d}`);
      for (const r of ins) {
        for (const x of r.insights?.days ?? []) {
          if (x.type === 'lateIn' && Number(x.days) > 0) late.add(`${r.employee}|${d}`);
          if (x.type === 'earlyOut' && Number(x.days) > 0) early.add(`${r.employee}|${d}`);
        }
      }
    }
    const rows: Prisma.HrAttendanceDayCreateManyInput[] = [];
    for (const r of muster) {
      for (const rec of r.records ?? []) {
        const date = String(rec.attendanceDate ?? rec.date ?? '').slice(0, 10);
        if (!date) continue;
        const key = `${r.employeeId}|${date}`;
        rows.push({
          employeeId: Number(r.employeeId),
          date: toDbDate(date),
          shiftName: str(rec.shiftName),
          firstIn: istTime(rec.firstInTime),
          lastOut: istTime(rec.lastOutTime),
          session1: str(rec.session1label),
          session2: str(rec.session2label),
          dayType: str(rec.dayType),
          workMin: minutes(rec.totalWorkhrs),
          actualWorkMin: minutes(rec.actualWorkhrs),
          leaveCode: str(rec.leaveCode),
          onLeave: rec.onLeave === true,
          lateIn: late.has(key),
          earlyOut: early.has(key),
        });
      }
    }
    await this.prisma.$transaction(
      [
        this.prisma.hrAttendanceDay.deleteMany({ where: { date: { gte: toDbDate(from), lte: toDbDate(to) } } }),
        this.prisma.hrAttendanceDay.createMany({ data: rows, skipDuplicates: true }),
      ],
    );
    return rows.length;
  }
}
