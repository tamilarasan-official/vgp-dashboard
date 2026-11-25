import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncRunService } from '../../sync/sync-run.service';

export const HR_GROUPS = ['WW', 'IR', 'FLY', 'VEL', 'COMMON'] as const;
const GROUP_NAMES: Record<string, string> = {
  WW: 'Wonder World (Park)',
  IR: 'Ice Rink',
  FLY: 'Fly Dining',
  VEL: 'Velocity',
  COMMON: 'Common (Admin, Housekeeping, F&B, Kitchen)',
};
const n = (v: unknown) => Number(v ?? 0);

/**
 * Attendance rows counted only while the employee is employed (join date .. leaving date).
 * Property is PROVISIONAL, derived from the greytHR shift name until Location names are available.
 */
const ATT = Prisma.sql`
  SELECT a.*,
    CASE WHEN a.shift_name ~* '(ice|icr|rink)' THEN 'IR'
         WHEN a.shift_name ~* 'fly' THEN 'FLY'
         WHEN a.shift_name ~* 'velocity' THEN 'VEL'
         WHEN a.shift_name ~* 'park' THEN 'WW'
         ELSE 'COMMON' END AS grp,
    (CASE WHEN a.session1 = 'P' THEN 0.5 ELSE 0 END + CASE WHEN a.session2 = 'P' THEN 0.5 ELSE 0 END) AS present,
    (CASE WHEN a.session1 = 'A' THEN 0.5 ELSE 0 END + CASE WHEN a.session2 = 'A' THEN 0.5 ELSE 0 END) AS absent,
    (CASE WHEN a.session1 IN ('WOFF','OFF','H','HOL','PH') THEN 0.5 ELSE 0 END
     + CASE WHEN a.session2 IN ('WOFF','OFF','H','HOL','PH') THEN 0.5 ELSE 0 END) AS off,
    (CASE WHEN a.session1 IS NOT NULL AND a.session1 NOT IN ('P','A','WOFF','OFF','H','HOL','PH') THEN 0.5 ELSE 0 END
     + CASE WHEN a.session2 IS NOT NULL AND a.session2 NOT IN ('P','A','WOFF','OFF','H','HOL','PH') THEN 0.5 ELSE 0 END) AS leave,
    (a.session1 IS NULL AND a.session2 IS NULL) AS unmarked
  FROM hr_attendance_day a
  JOIN hr_employee e ON e.id = a.employee_id
  WHERE (e.date_of_join IS NULL OR a.date >= e.date_of_join)
    AND (e.leaving_date IS NULL OR a.date <= e.leaving_date)`;

@Injectable()
export class GreythrQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: SyncRunService,
  ) {}

  async summary(from: string, to: string, group: string) {
    const range = Prisma.sql`date BETWEEN ${from}::date AND ${to}::date`;
    const gf = group === 'ALL' ? Prisma.sql`TRUE` : Prisma.sql`grp = ${group}`;
    const where = Prisma.sql`WHERE ${range} AND ${gf}`;
    const Q = (body: Prisma.Sql) => this.prisma.$queryRaw<any[]>`WITH x AS (${ATT}) ${body}`;

    const [totals, snapshot, byGroup, byShift, daily, inTimes, active, joinLeave, monthly, lastSync] = await Promise.all([
      Q(Prisma.sql`
        SELECT COUNT(DISTINCT employee_id)::int AS employees, SUM(present)::float AS present, SUM(absent)::float AS absent,
               SUM(leave)::float AS leave, SUM(off)::float AS off,
               COUNT(*) FILTER (WHERE late_in)::int AS late, COUNT(*) FILTER (WHERE early_out)::int AS early,
               AVG(EXTRACT(EPOCH FROM (first_in AT TIME ZONE 'Asia/Kolkata')::time) / 60) FILTER (WHERE present > 0 AND first_in IS NOT NULL) AS avg_in_min,
               AVG(actual_work_min) FILTER (WHERE present = 1 AND actual_work_min > 0) AS avg_work_min
        FROM x ${where}`),
      Q(Prisma.sql`
        SELECT COUNT(DISTINCT employee_id)::int AS employees,
               COUNT(*) FILTER (WHERE present > 0)::int AS present, COUNT(*) FILTER (WHERE absent = 1)::int AS absent,
               COUNT(*) FILTER (WHERE off > 0)::int AS off, COUNT(*) FILTER (WHERE leave > 0)::int AS leave,
               COUNT(*) FILTER (WHERE unmarked)::int AS unmarked, COUNT(*) FILTER (WHERE late_in)::int AS late
        FROM x WHERE date = ${to}::date AND ${gf}`),
      Q(Prisma.sql`
        SELECT grp, COUNT(DISTINCT employee_id)::int AS employees, SUM(present)::float AS present, SUM(absent)::float AS absent,
               SUM(leave)::float AS leave, COUNT(*) FILTER (WHERE late_in)::int AS late
        FROM x WHERE ${range} GROUP BY grp`),
      Q(Prisma.sql`
        SELECT COALESCE(shift_name, 'No shift') AS shift, MIN(grp) AS grp, COUNT(DISTINCT employee_id)::int AS employees,
               SUM(present)::float AS present, SUM(absent)::float AS absent, SUM(leave)::float AS leave,
               COUNT(*) FILTER (WHERE late_in)::int AS late,
               AVG(EXTRACT(EPOCH FROM (first_in AT TIME ZONE 'Asia/Kolkata')::time) / 60) FILTER (WHERE present > 0 AND first_in IS NOT NULL) AS avg_in_min
        FROM x ${where} GROUP BY 1 ORDER BY 3 DESC`),
      Q(Prisma.sql`
        SELECT to_char(date, 'YYYY-MM-DD') AS date, COUNT(DISTINCT employee_id)::int AS employees,
               COUNT(*) FILTER (WHERE present > 0)::int AS present, COUNT(*) FILTER (WHERE absent = 1)::int AS absent,
               COUNT(*) FILTER (WHERE off > 0)::int AS off, COUNT(*) FILTER (WHERE leave > 0)::int AS leave,
               COUNT(*) FILTER (WHERE unmarked)::int AS unmarked, COUNT(*) FILTER (WHERE late_in)::int AS late
        FROM x ${where} GROUP BY 1 ORDER BY 1`),
      Q(Prisma.sql`
        SELECT EXTRACT(HOUR FROM first_in AT TIME ZONE 'Asia/Kolkata')::int AS hour, COUNT(*)::int AS punches
        FROM x ${where} AND present > 0 AND first_in IS NOT NULL GROUP BY 1 ORDER BY 1`),
      this.prisma.hrEmployee.count({ where: { leftOrg: false } }),
      this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*) FILTER (WHERE date_of_join BETWEEN ${from}::date AND ${to}::date)::int AS joiners,
               COUNT(*) FILTER (WHERE leaving_date BETWEEN ${from}::date AND ${to}::date)::int AS leavers
        FROM hr_employee`,
      this.prisma.$queryRaw<any[]>`
        WITH m AS (SELECT generate_series(date_trunc('month', ${to}::date) - interval '11 months', date_trunc('month', ${to}::date), interval '1 month')::date AS month)
        SELECT to_char(m.month, 'Mon YYYY') AS month,
               (SELECT COUNT(*) FROM hr_employee WHERE date_trunc('month', date_of_join) = m.month)::int AS joiners,
               (SELECT COUNT(*) FROM hr_employee WHERE date_trunc('month', leaving_date) = m.month)::int AS leavers,
               (SELECT COUNT(*) FROM hr_employee WHERE (date_of_join IS NULL OR date_of_join <= (m.month + interval '1 month' - interval '1 day'))
                   AND (leaving_date IS NULL OR leaving_date > (m.month + interval '1 month' - interval '1 day')))::int AS headcount
        FROM m ORDER BY m.month`,
      this.runs.lastSuccess('greythr'),
    ]);

    const t = totals[0] ?? {};
    const rate = (p: number, a: number, l: number) => (p + a + l ? p / (p + a + l) : 0);
    const hhmm = (min: unknown) => {
      if (min == null) return null;
      const m = Math.round(n(min));
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };

    return {
      range: { from, to },
      group,
      groupNames: GROUP_NAMES,
      lastSyncedAt: lastSync?.finishedAt ?? null,
      provisionalGrouping: true,
      kpis: {
        activeEmployees: active,
        employeesInPeriod: n(t.employees),
        presentDays: n(t.present),
        absentDays: n(t.absent),
        leaveDays: n(t.leave),
        attendanceRate: rate(n(t.present), n(t.absent), n(t.leave)),
        lateIns: n(t.late),
        earlyOuts: n(t.early),
        avgInTime: hhmm(t.avg_in_min),
        avgWorkHours: t.avg_work_min == null ? null : Math.round((n(t.avg_work_min) / 60) * 10) / 10,
        joiners: n(joinLeave[0]?.joiners),
        leavers: n(joinLeave[0]?.leavers),
      },
      snapshot: { date: to, ...(snapshot[0] ?? {}) },
      byGroup: HR_GROUPS.map((code) => {
        const g = byGroup.find((r) => r.grp === code) ?? {};
        return { code, name: GROUP_NAMES[code], employees: n(g.employees), present: n(g.present), absent: n(g.absent), leave: n(g.leave), late: n(g.late), rate: rate(n(g.present), n(g.absent), n(g.leave)) };
      }),
      byShift: byShift.map((r) => ({
        shift: r.shift,
        group: r.grp,
        employees: n(r.employees),
        rate: rate(n(r.present), n(r.absent), n(r.leave)),
        absent: n(r.absent),
        late: n(r.late),
        avgInTime: hhmm(r.avg_in_min),
      })),
      daily: daily.map((r) => ({ date: r.date, employees: n(r.employees), present: n(r.present), absent: n(r.absent), off: n(r.off), leave: n(r.leave), unmarked: n(r.unmarked), late: n(r.late) })),
      inTimes: inTimes.map((r) => ({ hour: n(r.hour), punches: n(r.punches) })),
      monthly: monthly.map((r) => ({ month: r.month, joiners: n(r.joiners), leavers: n(r.leavers), headcount: n(r.headcount) })),
    };
  }
}
