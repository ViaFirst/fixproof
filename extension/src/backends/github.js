// GitHub Issues backend: one tasks repository per project (see docs/TICKET-FORMAT.md).
// Interface shared by every backend: test(settings, project) and createTicket(settings, project, ticket).
const API = 'https://api.github.com';

async function call(token, path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    body: body && JSON.stringify(body),
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data?.message || r.statusText}`);
  return data;
}
const b64 = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function test(settings, project) {
  const repo = await call(settings.token, `/repos/${project.repo}`);
  if (!repo.permissions?.push) throw new Error('No write access to ' + project.repo);
  return { name: repo.full_name, private: repo.private };
}

// ticket: { title, labels[], bodyFor(images) -> markdown, meta, images: [{ name, dataUrl }] }
export async function createTicket(settings, project, ticket) {
  const { token } = settings, repo = project.repo;
  // 1) the issue first: its number names the screenshot folder
  const issue = await call(token, `/repos/${repo}/issues`, { method: 'POST', body: { title: ticket.title, body: ticket.bodyFor([]), labels: ticket.labels } });
  // 2) screenshots into the tasks repo, 3) the final body with images and the machine block
  const images = [];
  for (const img of ticket.images) {
    const path = `screenshots/${issue.number}/${img.name}`;
    const put = await call(token, `/repos/${repo}/contents/${path}`, { method: 'PUT', body: { message: `#${issue.number}: ${img.name}`, content: b64(img.dataUrl) } });
    images.push({ path, url: put.content.html_url + '?raw=true' });
  }
  if (images.length) await call(token, `/repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: { body: ticket.bodyFor(images) } });
  return { number: issue.number, url: issue.html_url };
}
