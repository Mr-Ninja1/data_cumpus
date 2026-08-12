"use client";

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

type Settings = {
  school_name: string;
  school_short_name: string;
  default_program: string | null;
  default_proposal_spec_key: string | null;
  logo_path: string | null;
};

type SpecRecord = {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  spec_json?: unknown;
};

const DEFAULTS: Settings = {
  school_name: 'Zambia University College of Technology',
  school_short_name: 'ZUT',
  default_program: 'Information Technology',
  default_proposal_spec_key: 'zut-it-final-year-proposal',
  logo_path: null,
};

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export default function AdminProposalAssetsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [specs, setSpecs] = useState<SpecRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [specTitle, setSpecTitle] = useState('ZUT IT Final Year Proposal Standard');
  const [specDescription, setSpecDescription] = useState('Main project proposal drafting standard for Zambia University College of Technology Information Technology students.');
  const [specJsonText, setSpecJsonText] = useState('');
  const [specSaving, setSpecSaving] = useState(false);
  const specFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in required');

      const [settingsRes, specsRes] = await Promise.all([
        fetch('/api/admin/workspace-school-settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/document-specs', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [settingsJson, specsJson] = await Promise.all([
        settingsRes.json(),
        specsRes.json(),
      ]);

      if (!settingsRes.ok) throw new Error(settingsJson.error || 'Could not load school settings');
      if (!specsRes.ok) throw new Error(specsJson.error || 'Could not load specs');

      setSettings({ ...DEFAULTS, ...(settingsJson.settings || {}) });
      const loadedSpecs = Array.isArray(specsJson.specs) ? specsJson.specs : [];
      setSpecs(loadedSpecs);

      const defaultSpec = loadedSpecs.find((entry: SpecRecord) => entry.key === (settingsJson.settings?.default_proposal_spec_key || DEFAULTS.default_proposal_spec_key)) || loadedSpecs[0];
      if (defaultSpec) {
        setSpecTitle(defaultSpec.title || specTitle);
        setSpecDescription(defaultSpec.description || specDescription);
        setSpecJsonText(defaultSpec.spec_json ? JSON.stringify(defaultSpec.spec_json, null, 2) : '');
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not load proposal setup');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in required');

      let logoPath = settings.logo_path;
      if (logoFile) {
        const logoForm = new FormData();
        logoForm.set('file', logoFile);
        const uploadRes = await fetch('/api/admin/workspace-school-settings/logo', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: logoForm,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || 'Could not upload logo');
        logoPath = uploadJson.path || logoPath;
      }

      const res = await fetch('/api/admin/workspace-school-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...settings, logo_path: logoPath, metadata: { updated_from: 'proposal-setup-hub' } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save school settings');
      setSettings({ ...DEFAULTS, ...(json.settings || {}), logo_path: logoPath });
      setLogoFile(null);
      setMessage('Proposal setup saved. The cover page can now use the uploaded school logo.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not save school settings');
    } finally {
      setSaving(false);
    }
  }

  function onSpecFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        setSpecJsonText(JSON.stringify(parsed, null, 2));
        setMessage(`Loaded ${file.name}. Review it below, then save.`);
      } catch {
        setMessage(`${file.name} is not valid JSON — fix it and try again.`);
      }
    };
    reader.readAsText(file);
    if (specFileRef.current) specFileRef.current.value = '';
  }

  async function saveSpec(e: React.FormEvent) {
    e.preventDefault();
    setSpecSaving(true);
    setMessage('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in required');
      let specJsonParsed: unknown = null;
      if (specJsonText.trim()) {
        specJsonParsed = JSON.parse(specJsonText);
      }

      const res = await fetch('/api/admin/document-specs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: settings.default_proposal_spec_key || DEFAULTS.default_proposal_spec_key,
          title: specTitle,
          description: specDescription,
          spec_md: '',
          spec_json: specJsonParsed,
          approved: true,
          is_public: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save spec');
      setMessage('Proposal spec saved. The AI will now use only the relevant chapter fragment during generation.');
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'The JSON is not valid, or the save failed. Fix it and try again.');
    } finally {
      setSpecSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div>
        <h2 className="text-2xl font-semibold text-white">Proposal setup</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Two things, in order: 1) school logo &amp; branding, 2) the proposal spec JSON you&apos;ve already
          prepared. The spec JSON is the AI&apos;s only source of required structure — there is no sample
          proposal to upload and no document conversion here. Bring your own JSON and paste or upload it directly.
        </p>
      </div>

      {message ? <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h3 className="text-lg font-semibold text-white">1. School branding</h3>
        <p className="mt-1 text-sm text-slate-400">
          The cover page uses these defaults, including the uploaded logo, student name, and student ID.
        </p>
        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
          <div className="font-semibold text-cyan-200">Logo file naming</div>
          <p className="mt-1">
            The exact filename doesn&apos;t matter — it&apos;s stored under a generated path automatically.
            For your own sanity, name it something like{' '}
            <code className="rounded bg-black/30 px-1 py-0.5">zut-logo.png</code>: lowercase, hyphenated,
            PNG with a transparent background if you have one, and reasonably small (well under 1MB).
          </p>
        </div>
        <form onSubmit={saveSettings} className="mt-4 space-y-4">
          {loading ? (
            <div className="text-sm text-slate-400">Loading proposal setup…</div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  School name
                  <input
                    value={settings.school_name}
                    onChange={(e) => setSettings((s) => ({ ...s, school_name: e.target.value }))}
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Short name
                  <input
                    value={settings.school_short_name}
                    onChange={(e) => setSettings((s) => ({ ...s, school_short_name: e.target.value }))}
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Default program
                  <input
                    value={settings.default_program || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, default_program: e.target.value }))}
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Default proposal spec key
                  <input
                    value={settings.default_proposal_spec_key || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, default_proposal_spec_key: e.target.value }))}
                    placeholder="zut-it-final-year-proposal"
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm text-slate-300">
                  School logo
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    className="mt-1 block w-full text-sm text-slate-300"
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Current path: {settings.logo_path || 'none uploaded yet'}
                </p>
              </div>

              <button disabled={saving} className="rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950">
                {saving ? 'Saving…' : 'Save branding and defaults'}
              </button>
            </>
          )}
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h3 className="text-lg font-semibold text-white">2. Proposal spec (JSON)</h3>
        <p className="mt-1 text-sm text-slate-400">
          This defines the exact required chapters, sections, and numbering. Bring the JSON you&apos;ve
          already prepared — paste it below or upload the file. Nothing here converts a PDF for you.
        </p>
        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
          <div className="font-semibold text-cyan-200">Spec key naming</div>
          <p className="mt-1">
            Format: <code className="rounded bg-black/30 px-1 py-0.5">[school]-[program]-[document-type]</code>,
            e.g. <code className="rounded bg-black/30 px-1 py-0.5">zut-it-final-year-proposal</code>. Keep this
            key stable over time and edit the JSON in place rather than creating new keys — the workspace looks
            up the spec by this exact key. For your own local file, naming it{' '}
            <code className="rounded bg-black/30 px-1 py-0.5">{'{key}'}.json</code> keeps things easy to track.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={specFileRef}
              type="file"
              accept=".json"
              onChange={onSpecFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => specFileRef.current?.click()}
              className="rounded-full border border-white/15 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Upload a JSON file
            </button>
            <span className="text-xs text-slate-500">or paste directly into the box below</span>
          </div>

          <form onSubmit={saveSpec} className="space-y-4">
            <label className="block text-sm text-slate-300">
              Spec title
              <input
                value={specTitle}
                onChange={(e) => setSpecTitle(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Spec description
              <input
                value={specDescription}
                onChange={(e) => setSpecDescription(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Spec JSON
              <textarea
                value={specJsonText}
                onChange={(e) => setSpecJsonText(e.target.value)}
                rows={16}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                placeholder='{"chapters": [{"key": "chapter_1", "title": "Introduction", "sections": []}]}'
              />
            </label>
            <button disabled={specSaving} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950">
              {specSaving ? 'Saving…' : 'Save proposal spec'}
            </button>
          </form>

          <div className="space-y-2">
            {specs.map((spec) => (
              <div key={spec.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-200">
                <div className="font-semibold text-white">{spec.title}</div>
                <div className="mt-1 text-xs text-slate-400">{spec.key}</div>
                <div className="mt-1 text-xs text-slate-500">{spec.spec_json ? 'JSON ready' : 'No JSON yet'}</div>
              </div>
            ))}
            {specs.length === 0 ? <div className="text-sm text-slate-500">No specs saved yet.</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
