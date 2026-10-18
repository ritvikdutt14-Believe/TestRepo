// Stub worker: polls Camunda for jobs and completes them with fake data.
// Swap each handler for the real thing (Claude Code, GitHub Actions, Vercel) later.

const base = process.env.CAMUNDA_REST_ADDRESS.replace(/\/$/, "");
const types = ["plan-task", "build-task", "start-ci", "wait-ci", "review-task", "deploy-task"];

async function token() {
  const r = await fetch(process.env.CAMUNDA_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      audience: "zeebe.camunda.io",
      client_id: process.env.CAMUNDA_CLIENT_ID,
      client_secret: process.env.CAMUNDA_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

const handlers = {
  "plan-task":   (v) => ({ tasks: ["T1: add README"], attempts: v.attempts ?? 0 }),
  "build-task":  (v) => ({ status: "OK", commitSha: "stub123", cost: 0.01 }),
  "start-ci":    (v) => ({ runId: 1 }),
  "wait-ci":     (v) => ({ conclusion: "success" }),
  "review-task": (v) => ({ judge: "pass" }),
  "deploy-task": (v) => ({ url: "https://example.com" }),
};

async function run() {
  const t = await token();
  const h = { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Accept: "application/json" };
  let done = 0;
  for (const type of types) {
    const act = await fetch(`${base}/v2/jobs/activation`, {
      method: "POST", headers: h,
      body: JSON.stringify({ type, worker: "github-stub", timeout: 60000, maxJobsToActivate: 5, requestTimeout: 2000 }),
    });
    if (!act.ok) { console.log(type, "activate", act.status, await act.text()); continue; }
    const { jobs = [] } = await act.json();
    for (const job of jobs) {
      const out = handlers[type](job.variables ?? {});
      const c = await fetch(`${base}/v2/jobs/${job.jobKey}/completion`, {
        method: "POST", headers: h, body: JSON.stringify({ variables: out }),
      });
      console.log(type, job.jobKey, c.ok ? "completed" : `failed ${c.status} ${await c.text()}`, JSON.stringify(out));
      done++;
    }
  }
  console.log(`done: ${done} job(s)`);
}

run().catch((e) => { console.error(e); process.exit(1); });
