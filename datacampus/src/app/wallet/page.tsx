"use client";

import React, { useEffect, useRef, useState } from "react";
import { Wallet, Sparkles, ArrowUpRight, Send, X } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import VerifiedBadge from "@/components/VerifiedBadge";

interface WalletData { balance_credits?: number; user_id?: string; updated_at?: string; }
interface Transaction { id: string; kind: string; credits_delta: number; created_at: string; provider?: string; metadata?: any; }
interface RecipientCandidate { id: string; display_name: string | null; role?: string | null; is_verified?: boolean | null; }

const TX_KIND_LABELS: Record<string, string> = {
  transfer_out: "Sent to a friend",
  transfer_in: "Received from a friend",
  follow_fee: "Follow fee paid",
  follow_fee_earned: "Follow fee earned",
  message_request_fee: "First message fee paid",
  message_request_fee_earned: "First message fee earned",
  message_request_refund: "First message fee refunded",
  message_request_refund_out: "Refunded a first message fee",
  post_unlock: "Unlocked a paid post",
  post_unlock_earned: "Someone unlocked your post",
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState<RecipientCandidate[]>([]);
  const [recipientSearchLoading, setRecipientSearchLoading] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientCandidate | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadWallet();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (selectedRecipient || recipientQuery.trim().length === 0) {
      setRecipientResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void searchRecipients(recipientQuery.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [recipientQuery, selectedRecipient]);

  const searchRecipients = async (query: string) => {
    setRecipientSearchLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, is_verified")
      .ilike("display_name", `%${query}%`)
      .limit(8);
    if (!error) {
      setRecipientResults((data as RecipientCandidate[]) ?? []);
    }
    setRecipientSearchLoading(false);
  };

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

  const sendCredits = async () => {
    setSendError(null);
    if (!selectedRecipient) {
      setSendError("Pick a recipient first.");
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setSendError("Enter a positive whole number of credits.");
      return;
    }

    setSending(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setSendError("You need to be signed in to send credits.");
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientId: selectedRecipient.id,
          amount: parsedAmount,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSendError(json.error || "Something went wrong sending credits.");
        setSending(false);
        return;
      }

      setWallet((prev) => ({ ...(prev ?? {}), balance_credits: json.balance }));
      setMessage(`Sent ${json.amount} credits to ${selectedRecipient.display_name || "user"}.`);
      setSelectedRecipient(null);
      setRecipientQuery("");
      setAmount("");
      setNote("");
      await loadWallet();
    } catch {
      setSendError("Something went wrong sending credits.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-8 md:px-0">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="shrink-0 rounded-xl bg-violet-100 p-3 text-violet-700"><Wallet size={20} /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold">Wallet</h1>
              <p className="text-sm text-gray-600">Spend credits on AI proposals and other premium actions.</p>
            </div>
          </div>
          <button onClick={depositCredits} className="shrink-0 self-start rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white sm:self-auto">Top up credits</button>
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
          <Send size={18} className="text-gray-500" />
          <h2 className="font-semibold">Send credits</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">Send a gift of credits directly to another person.</p>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <label className="block text-xs font-semibold uppercase text-gray-500">Recipient</label>
            {selectedRecipient ? (
              <div className="mt-1 flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {selectedRecipient.display_name || "Unnamed user"}
                  <VerifiedBadge role={selectedRecipient.role} isVerified={selectedRecipient.is_verified} size="sm" />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRecipient(null);
                    setRecipientQuery("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Clear recipient"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={recipientQuery}
                onChange={(e) => setRecipientQuery(e.target.value)}
                placeholder="Search by name..."
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            )}
            {!selectedRecipient && recipientQuery.trim().length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
                {recipientSearchLoading ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
                ) : recipientResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No matches found.</div>
                ) : (
                  recipientResults.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        setSelectedRecipient(candidate);
                        setRecipientResults([]);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                    >
                      {candidate.display_name || "Unnamed user"}
                      <VerifiedBadge role={candidate.role} isVerified={candidate.is_verified} size="sm" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-gray-500">Amount (credits)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-gray-500">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Say something nice..."
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          {sendError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sendError}</div>}

          <button
            type="button"
            onClick={sendCredits}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ArrowUpRight size={18} className="text-gray-500" />
          <h2 className="font-semibold">Recent transactions</h2>
        </div>
        <div className="mt-4 space-y-3">
          {transactions.length === 0 ? <p className="text-sm text-gray-500">No transactions yet.</p> : transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm">
              <div>
                <div className="font-medium">{TX_KIND_LABELS[tx.kind] || tx.kind}</div>
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
