// Outbox (MSL-102): a ticket that could not be sent (backend down, network, timeout) is kept here with its screenshot
// and retried until it gets through. Every ticket has an id that the backends use to make retries safe
// (Mesila: Idempotency-Key; GitHub: the id in the machine block), so a retry never creates a duplicate.
const KEY = 'outbox', SENT = 'sentLog', ALARM = 'fixproof-outbox';

/** Error of a backend call: retry — try again later (network, 5xx, 429, 408); action — the user must fix something (401/403/404) */
export class SendError extends Error {
  constructor(message, { status = 0, retry = false, action = false } = {}) {
    super(message);
    this.status = status; this.retry = retry; this.action = action;
  }
}
/** Classify an HTTP answer (status 0 = no answer at all) */
export function errorFor(status, message) {
  const retry = !status || status >= 500 || status === 429 || status === 408;
  const action = [401, 403, 404].includes(status);
  return new SendError(message, { status, retry, action });
}

/** Pause before the next attempt: 30 s, 1, 2, 4, 8 … minutes, at most an hour */
export const delayFor = attempts => Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);

const read = async () => (await chrome.storage.local.get(KEY))[KEY] || [];
const write = async items => { await chrome.storage.local.set({ [KEY]: items }); await sync(items); };

export const list = read;
export async function sentLog() { return (await chrome.storage.local.get(SENT))[SENT] || []; }

/** Badge with the number of waiting tickets (red when one needs the user), alarm only while something waits */
export async function sync(items) {
  items ??= await read();
  await chrome.action.setBadgeText({ text: items.length ? String(items.length) : '' });
  if (items.length) await chrome.action.setBadgeBackgroundColor({ color: items.some(i => i.state === 'action') ? '#d0103a' : '#f59e0b' });
  if (items.some(i => i.state === 'pending')) await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  else await chrome.alarms.clear(ALARM);
}

export async function add(item) {
  const items = (await read()).filter(i => i.id !== item.id);
  await write([...items, item]);
}

export async function remove(id) { await write((await read()).filter(i => i.id !== id)); }

async function logSent(entry) {
  const log = [entry, ...(await sentLog()).filter(e => e.id !== entry.id)].slice(0, 20);
  await chrome.storage.local.set({ [SENT]: log });
}

let running = null;
/**
 * Send what is due. send(item) → { ref, url } or throws SendError. force: ids to send now regardless of the pause
 * (also takes items that need an action — the user says they fixed it). One run at a time.
 */
export function process(send, opts = {}) {
  // a run is going: the next one starts right after it (a forced send must not be lost)
  if (running) return running.then(() => process(send, opts));
  const { force = [], onSent } = opts;
  running = (async () => {
    try {
      const now = Date.now();
      for (const item of await read()) {
        const forced = force.includes(item.id);
        if (!forced && (item.state !== 'pending' || item.nextAt > now)) continue;
        try {
          const r = await send(item);
          await remove(item.id);
          await logSent({ id: item.id, title: item.title, project: item.projectName, ref: r.ref || (r.number ? '#' + r.number : ''), url: r.url, at: new Date().toISOString(), attempts: item.attempts + 1 });
          await onSent?.(item, r);
        } catch (e) {
          const attempts = item.attempts + 1;
          const state = e.retry ? 'pending' : 'action';
          await add({ ...item, attempts, state, nextAt: Date.now() + delayFor(attempts), lastError: e.message, lastTryAt: new Date().toISOString() });
        }
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

export const ALARM_NAME = ALARM;
