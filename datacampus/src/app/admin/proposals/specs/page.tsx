"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function AdminSpecsPage() {
  const [specs, setSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [specMd, setSpecMd] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { fetchSpecs(); }, []);

  async function fetchSpecs() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/document-specs');
      const json = await res.json();
      setSpecs(json.specs || []);
    } catch (err: any) {
      setMessage(err.message || 'Failed to load specs');
    } finally { setLoading(false); }
  }

  async function saveSpec(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/api/admin/document-specs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, title, description, spec_md: specMd, approved: true, is_public: true }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setMessage('Saved');
      setKey(''); setTitle(''); setDescription(''); setSpecMd('');
      fetchSpecs();
    } catch (err: any) { setMessage(err.message || 'Save failed'); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-semibold">Document Specs (SKILLs)</h2>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          <h3 className="font-medium">Existing</h3>
          {loading ? <div>Loading…</div> : specs.map(s => <div key={s.id} className="p-2 border rounded my-1"><strong>{s.key}</strong><div className="text-sm">{s.title}</div></div>)}
        </div>
        <div className="md:col-span-2">
          <form onSubmit={saveSpec} className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Key</label>
              <input value={key} onChange={(e)=>setKey(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Title</label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Description</label>
              <input value={description} onChange={(e)=>setDescription(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Spec (Markdown)</label>
              <textarea value={specMd} onChange={(e)=>setSpecMd(e.target.value)} rows={12} className="mt-1 block w-full rounded border px-2 py-1" />
            </div>
            <div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded">Save Spec</button>
            </div>
            {message && <div className="text-sm mt-2">{message}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}
