import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const base = "http://127.0.0.1:3123";
const child = spawn("./node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", "3123"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "production" }
});
let log = "";
child.stdout.on("data", data => { log += String(data); });
child.stderr.on("data", data => { log += String(data); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const post = (payload) => fetch(`${base}/api/reservations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

try {
  let started = false;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error(`Next.js exited: ${child.exitCode}: ${log}`);
    try {
      const r = await fetch(`${base}/api/workshops`);
      if (r.ok) { started = true; break; }
    } catch { /* server starting */ }
    await sleep(500);
  }
  if (!started) throw new Error(`Next.js did not become ready: ${log}`);

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Apprendre/);
  const initial = await (await fetch(`${base}/api/workshops`)).json();
  assert.equal(initial.workshops.length, 3);
  const before = initial.workshops.find(w => w.id === "typescript-clinic").remaining;

  const invalid = await post({ workshopId: "typescript-clinic", quantity: 1, requestId: randomUUID(), userId: "someone-else" });
  assert.equal(invalid.status, 400);

  const req = { workshopId: "typescript-clinic", quantity: 1, requestId: randomUUID() };
  const first = await post(req);
  assert.equal(first.status, 201);
  const booking = await first.json();
  assert.match(booking.reservationId, /^DEMO-/);
  assert.equal((await post(req)).status, 201);
  const now = await (await fetch(`${base}/api/workshops`)).json();
  assert.equal(now.workshops.find(w => w.id === "typescript-clinic").remaining, before - 1);

  const races = await Promise.all(Array.from({ length: 8 }, () => post({ workshopId: "nextjs-lab", quantity: 1, requestId: randomUUID() })));
  assert.equal(races.filter(r => r.status === 201).length, 3);
  assert.equal(races.filter(r => r.status === 409).length, 5);
  console.log("Smoke passed: SSR page, GET, input validation, idempotency, 8 HTTP requests competing for 3 places.");
} catch (err) {
  console.error(log);
  throw err;
} finally {
  child.kill("SIGTERM");
}