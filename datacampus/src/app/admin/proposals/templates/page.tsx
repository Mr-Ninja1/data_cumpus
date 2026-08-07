"use client";
import React, { useState } from 'react';
import { supabase } from '@/utils/supabaseClient';

export default function AdminProposalTemplatesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMessage('Select a file first');
    setLoading(true);
    setMessage('');

    try {
      const path = `proposal_templates/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('proposal_templates').upload(path, file as File);
      if (uploadError) throw uploadError;

      // Register template with server (admin route)
      const resp = await fetch('/api/admin/proposal-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, file_path: path }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Failed to register template');

      setMessage('Uploaded and registered template');
      setTitle('');
      setDescription('');
      setFile(null);
    } catch (err: any) {
      setMessage(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Proposal Templates (Admin)</h2>
      <form onSubmit={handleUpload} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">File</label>
          <input type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} className="mt-1" />
        </div>
        <div>
          <button disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">{loading ? 'Uploading…' : 'Upload & Register'}</button>
        </div>
        {message && <div className="text-sm text-gray-700">{message}</div>}
      </form>
    </div>
  );
}
