"use client";

import React, { useEffect, useState } from "react";
import { Wallet, Sparkles, ArrowUpRight } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

interface WalletData { balance_credits?: number; user_id?: string; updated_at?: string; }
interface Transaction { id: string; kind: string; credits_delta: number; created_at: string; provider?: string; metadata?: any; }

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWallet();
  }, []);

  const loadWallet = async () => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    const [walletRes, txRes] = await Promise.all([
      fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/wallet/transactions", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const walletJson = await walletRes.json();
    const txJson = await txRes.json();
    setWallet(walletJson.wallet ?? null);
    setTransactions(txJson.transactions ?? []);
    setLoading(false);
  };

  const depositCredits = async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ credits: 50, reference: `demo-${Date.now()}` }),
    });
    const json = await res.json();
    setMessage(json.error ? json.error : `Added ${json.deposited ?? 0} credits.`);
    await loadWallet();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-3 md:px-0 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Wallet size={20} /></div>
            <div>
              <h1 className="text-2xl font-semibold">Wallet</h1>
              <p className="text-sm text-gray-600">Spend credits on AI proposals and other premium actions.</p>
            </div>
          </div>
          <button onClick={depositCredits} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Top up credits</button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl bg-gray-950 p-6 text-white">
            <div className="text-sm text-gray-400">Available credits</div>
            <div className="mt-3 text-4xl font-semibold">{loading ? "—" : wallet?.balance_credits ?? 0}</div>
            <div className="mt-2 text-sm text-gray-400">Use them for proposal generation and other paid AI features.</div>
          </div>
          <div className="rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} /> How credits work</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>• Credits are deducted server-side</li>
              <li>• Each proposal generation consumes a small amount</li>
              <li>• Wallet balance is the single source of truth</li>
            </ul>
          </div>
        </div>
      </div>

      {message && <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{message}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ArrowUpRight size={18} className="text-gray-500" />
          <h2 className="font-semibold">Recent transactions</h2>
        </div>
        <div className="mt-4 space-y-3">
          {transactions.length === 0 ? <p className="text-sm text-gray-500">No transactions yet.</p> : transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm">
              <div>
                <div className="font-medium capitalize">{tx.kind}</div>
                <div className="text-gray-500">{tx.provider || "internal"}</div>
              </div>
              <div className={`font-semibold ${tx.credits_delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {tx.credits_delta > 0 ? `+${tx.credits_delta}` : tx.credits_delta}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
