#!/usr/bin/env node
// Autopilot worker: keeps calling the autopilot-tick endpoint so proposals
// with autopilot enabled keep drafting even if every user has closed the
// site. This must run as a persistent Node process (pm2, a small always-on
// VM/Render/Railway service, etc.) — NOT as a Vercel serverless function,
// since a single tick can involve a real AI call that may run well past a
// typical serverless timeout, and this loop needs to keep running between
// ticks regardless of any HTTP request lifecycle.
//
// Requires WORKER_BEARER to match the same value the Next.js app checks in
// /api/generator/autopilot-tick. Optional GENERATOR_LOCAL_BASE (defaults to
// http://localhost:3000) if the app isn't running on the default port/host.

const fetch = require('node-fetch');

const BASE = process.env.GENERATOR_LOCAL_BASE || 'http://localhost:3000';
const BEARER = process.env.WORKER_BEARER || '';
const POLL_INTERVAL_MS = Number(process.env.AUTOPILOT_POLL_INTERVAL_MS || 8000);

if (!BEARER) {
  console.error('Set WORKER_BEARER to the same value the Next.js app expects.');
  process.exit(1);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/generator/autopilot-tick`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${BEARER}` },
    });
    const json = await res.json();
    if (!res.ok) {
      console.error('Autopilot tick failed', json);
      return;
    }
    if (json.processed > 0) {
      console.log(`Autopilot tick processed ${json.processed} project(s):`, json.results);
    }
  } catch (err) {
    console.error('Autopilot tick request error', err);
  }
}

(async function main() {
  console.log('Autopilot worker started, polling every', POLL_INTERVAL_MS, 'ms');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
    await sleep(POLL_INTERVAL_MS);
  }
})();
