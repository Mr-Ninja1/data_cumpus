#!/usr/bin/env node
// Simple job worker: polls pending jobs and processes them one by one.
// Requires SUPABASE_SERVICE_ROLE_KEY to be set in env.

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY || !SUPABASE_URL) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function processJob(job) {
  console.log('Processing job', job.id);
  try {
    await supabase.from('generator_jobs').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', job.id);

    const payload = job.payload || {};
    // For now we call the internal generate route synchronously via REST to reuse logic.
    const res = await fetch(`${process.env.GENERATOR_LOCAL_BASE || 'http://localhost:3000'}/api/proposals/${payload.projectId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WORKER_BEARER || ''}` },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      await supabase.from('generator_jobs').update({ status: 'failed', error_text: json?.error || 'generate failed', updated_at: new Date().toISOString() }).eq('id', job.id);
      return;
    }

    await supabase.from('generator_jobs').update({ status: 'completed', result: json.generation ?? json, updated_at: new Date().toISOString() }).eq('id', job.id);
  } catch (err) {
    console.error('Job processing error', err);
    await supabase.from('generator_jobs').update({ status: 'failed', error_text: String(err), updated_at: new Date().toISOString() }).eq('id', job.id);
  }
}

(async function main() {
  console.log('Job worker started');
  while (true) {
    try {
      const { data: jobs, error } = await supabase.from('generator_jobs').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(5);
      if (error) {
        console.error('Failed to fetch jobs', error);
        await sleep(5000);
        continue;
      }
      if (!jobs || jobs.length === 0) {
        await sleep(2000);
        continue;
      }

      for (const job of jobs) {
          // Call orchestration endpoint to run the job
          try {
            const res = await fetch(`${process.env.GENERATOR_LOCAL_BASE || 'http://localhost:3000'}/api/generator/run-job`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WORKER_BEARER || ''}` },
              body: JSON.stringify({ jobId: job.id }),
            });

            const json = await res.json();
            if (!res.ok) {
              console.error('Orchestration failed', json);
              await supabase.from('generator_jobs').update({ status: 'failed', error_text: json?.error || 'orchestration failed', updated_at: new Date().toISOString() }).eq('id', job.id);
            }
          } catch (e) {
            console.error('Worker orchestration error', e);
            await supabase.from('generator_jobs').update({ status: 'failed', error_text: String(e), updated_at: new Date().toISOString() }).eq('id', job.id);
          }
          await sleep(500); // gentle throttle
        }
    } catch (e) {
      console.error('Worker loop error', e);
      await sleep(5000);
    }
  }
})();
