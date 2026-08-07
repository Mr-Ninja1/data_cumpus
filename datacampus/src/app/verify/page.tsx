"use client";

import React, { useEffect, useState } from "react";
import { Camera, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    void loadRequests();
  }, []);

  const loadRequests = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/verify", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.requests) setRequests(json.requests);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setMessage(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setMessage("Please sign in first.");
      setLoading(false);
      return;
    }

    const filePath = `verify/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("papers").upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setMessage(uploadError.message);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        documentType: "zictc_id",
        filePath,
        confidence: 0.9,
        extractedName: "Verified Student",
        extractedStudentId: "123456",
        extractedProgram: "Computer Science",
        extractedDepartment: "ICT",
      }),
    });

    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(json.error || "Verification failed.");
      return;
    }

    setMessage("Verification request submitted successfully.");
    await loadRequests();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-3 md:px-0 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><ShieldCheck size={20} /></div>
          <div>
            <h1 className="text-2xl font-semibold">Verify your student identity</h1>
            <p className="text-sm text-gray-600">Upload your ZICTC ID image for review and approval.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center hover:border-gray-500">
          <UploadCloud size={28} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Choose an image</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {file && <p className="text-sm text-gray-600">Selected: {file.name}</p>}
        <button type="submit" disabled={loading || !file} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "Uploading..." : "Submit verification"}
        </button>
      </form>

      {message && <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{message}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-gray-500" />
          <h2 className="font-semibold">Recent requests</h2>
        </div>
        <div className="mt-4 space-y-3">
          {requests.length === 0 ? <p className="text-sm text-gray-500">No verification requests yet.</p> : requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">{request.status}</span>
                <span className="text-gray-500">{request.created_at ? new Date(request.created_at).toLocaleDateString() : "—"}</span>
              </div>
              <div className="mt-1 text-gray-600">Confidence: {request.confidence ?? "n/a"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
