import 'dotenv/config';
import os from 'os';
import { DashboardApi } from './api';
import { TallyClient } from './tally';

/**
 * VGP Sync Agent - Tally connector.
 * Runs inside VGP's network, reads Tally read-only and pushes changes to the dashboard API.
 *   npm run once   -> one sync pass and exit
 *   npm run dev    -> keeps running, syncs every INTERVAL_MINUTES
 */

const cfg = {
  tallyUrl: process.env.TALLY_URL ?? 'http://localhost:9000',
  apiUrl: (process.env.API_URL ?? 'http://localhost:4000/api').replace(/\/$/, ''),
  token: process.env.AGENT_TOKEN ?? '',
  agentId: process.env.AGENT_ID ?? os.hostname(),
  intervalMin: Number(process.env.INTERVAL_MINUTES ?? 15),
  fullCheckHour: Number(process.env.FULL_CHECK_HOUR ?? 22), // IST hour for the daily deleted-voucher check (Tally closes ~23:00)
  masterRefreshHours: Number(process.env.MASTER_REFRESH_HOURS ?? 6),
  windowSize: Number(process.env.ALTERID_WINDOW ?? 1500),
  batchSize: Number(process.env.PUSH_BATCH ?? 500),
  companies: (process.env.COMPANIES ?? '').split('|').map((s) => s.trim()).filter(Boolean),
};

const tally = new TallyClient(cfg.tallyUrl);
const api = new DashboardApi(cfg.apiUrl, cfg.token);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const istNow = () => new Date(Date.now() + 330 * 60 * 1000);
const istToday = () => istNow().toISOString().slice(0, 10);
const istHour = () => istNow().getUTCHours();
const hoursSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

async function syncCompany(name: string, booksFrom: string) {
  const from = booksFrom || `${Number(istToday().slice(0, 4)) - 1}-04-01`;
  const to = addDays(istToday(), 365); // include future-dated vouchers
  let state = await api.state(name);

  // 1. Masters (groups + ledgers with balances) - first run and every few hours.
  if (!state.known || hoursSince(state.lastMasterSync) >= cfg.masterRefreshHours) {
    const [groups, ledgers] = await Promise.all([tally.groups(name), tally.ledgers(name, from, istToday())]);
    const r = await api.masters({ company: name, booksFrom: from, groups, ledgers });
    log(`[${name}] masters: ${r.groups} groups, ${r.ledgers} ledgers`);
    state = await api.state(name);
  }

  // 2. Changed vouchers since the last AlterID, fetched in AlterID windows to keep Tally responses small.
  const changed = await tally.voucherIndex(name, from, to, state.lastAlterId);
  if (changed.length) {
    const maxAlter = Math.max(...changed.map((v) => v.alterId));
    let pushed = 0;
    for (let lo = state.lastAlterId; lo < maxAlter; lo += cfg.windowSize) {
      const hi = Math.min(lo + cfg.windowSize, maxAlter);
      const vouchers = await tally.vouchers(name, from, to, lo, hi);
      vouchers.sort((a, b) => a.alterId - b.alterId);
      for (let i = 0; i < vouchers.length; i += cfg.batchSize) {
        const r = await api.vouchers({ company: name, vouchers: vouchers.slice(i, i + cfg.batchSize) });
        pushed += r.vouchers;
      }
    }
    log(`[${name}] vouchers: ${pushed} changed (AlterID ${state.lastAlterId} -> ${maxAlter})`);
  } else {
    log(`[${name}] vouchers: no changes (AlterID ${state.lastAlterId})`);
  }

  // 3. Once a day, in the evening: find vouchers deleted in Tally.
  const checkedToday = state.lastFullCheck && new Date(new Date(state.lastFullCheck).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10) === istToday();
  if (istHour() >= cfg.fullCheckHour && !checkedToday) {
    const all = await tally.voucherIndex(name, from, to);
    const r = await api.guidCheck({ company: name, from, to, guids: all.map((v) => v.guid) });
    log(`[${name}] deleted-check: ${r.checked} vouchers, ${r.markedDeleted} marked deleted, ${r.restored} restored`);
  }
}

let busy = false;
async function runOnce() {
  if (busy) return log('previous run still busy, skipping');
  busy = true;
  const started = Date.now();
  try {
    let open: { name: string; booksFrom: string }[] = [];
    try {
      open = await tally.companies();
    } catch (e) {
      log('Tally not reachable:', (e as Error).message);
      await api.heartbeat({ agentId: cfg.agentId, tallyReachable: false, error: (e as Error).message }).catch(() => {});
      return;
    }
    const targets = cfg.companies.length ? open.filter((c) => cfg.companies.includes(c.name)) : open;
    await api.heartbeat({ agentId: cfg.agentId, host: os.hostname(), tallyReachable: true, companiesOpen: open.map((c) => c.name) });
    for (const c of targets) {
      try {
        await syncCompany(c.name, c.booksFrom);
      } catch (e) {
        log(`[${c.name}] sync failed:`, (e as Error).message);
      }
    }
    log(`run finished in ${((Date.now() - started) / 1000).toFixed(1)}s (${targets.length} company/companies)`);
  } finally {
    busy = false;
  }
}

async function main() {
  if (!cfg.token) throw new Error('AGENT_TOKEN is not set');
  log(`VGP agent ${cfg.agentId}: Tally ${cfg.tallyUrl} -> ${cfg.apiUrl}`);
  await runOnce();
  if (process.argv.includes('--once')) return;
  setInterval(runOnce, cfg.intervalMin * 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
