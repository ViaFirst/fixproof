// GitHub Issues backend: one tasks repository per project (see docs/TICKET-FORMAT.md).
// Interface shared by every backend: test(settings, project) and createTicket(settings, project, ticket).
import { errorFor } from '../outbox.js';

const API = 'https://api.github.com';

async function call(token, path, { method = 'GET', body, allow404 = false } = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    });
  } catch {
    throw errorFor(0, 'GitHub is not reachable');
  }
  if (allow404 && r.status === 404) return null;
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw errorFor(r.status, `GitHub ${r.status}: ${data?.message || r.statusText}`);
  return data;
}
const b64 = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function test(settings, project) {
  const repo = await call(settings.token, `/repos/${project.repo}`);
  if (!repo.permissions?.push) throw new Error('No write access to ' + project.repo);
  return { name: repo.full_name, private: repo.private };
}

// recent issues of the repo whose machine block has this ticket id
async function findIssue(token, repo, ticket) {
  const since = new Date(Date.parse(ticket.createdAt || Date.now()) - 3600_000).toISOString();
  const recent = (await call(token, `/repos/${repo}/issues?state=all&since=${encodeURIComponent(since)}&per_page=100&sort=created&direction=desc`)) || [];
  return recent.find(i => !i.pull_request && (i.body || '').includes(`"id":"${ticket.id}"`)) || null;
}

// ticket: { id, title, labels[], bodyFor(images) -> markdown, meta, images: [{ name, dataUrl }] }
export async function createTicket(settings, project, ticket) {
  const { token } = settings, repo = project.repo;
  // a retry from the outbox: the issue may already exist (its machine block carries the ticket id) — finish it, no duplicate
  let issue = ticket.id ? await findIssue(token, repo, ticket) : null;
  // 1) the issue first: its number names the screenshot folder
  issue ??= await call(token, `/repos/${repo}/issues`, { method: 'POST', body: { title: ticket.title, body: ticket.bodyFor([]), labels: ticket.labels } });
  // 2) screenshots into the tasks repo (a file left by a failed try is overwritten), 3) the final body with images
  const images = [];
  for (const img of ticket.images) {
    const path = `screenshots/${issue.number}/${img.name}`;
    const old = await call(token, `/repos/${repo}/contents/${path}`, { allow404: true });
    const put = await call(token, `/repos/${repo}/contents/${path}`, { method: 'PUT', body: { message: `#${issue.number}: ${img.name}`, content: b64(img.dataUrl), ...(old?.sha ? { sha: old.sha } : {}) } });
    images.push({ path, url: put.content.html_url + '?raw=true' });
  }
  if (images.length) await call(token, `/repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: { body: ticket.bodyFor(images) } });
  return { number: issue.number, url: issue.html_url };
}
