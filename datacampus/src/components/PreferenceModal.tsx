"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

const schools = [
	"School of Engineering & Technology",
	"School of Business",
	"School of Information & Communication Technology",
];

const programsMap: Record<string, string[]> = {
	"School of Engineering & Technology": [
		"Electrical & Electronics",
		"Telecommunications",
		"Instrumentation",
	],
	"School of Business": ["Accountancy", "BBA", "Marketing", "Purchasing & Supply"],
	"School of Information & Communication Technology": ["BSE", "Cyber Security", "BIT", "BICTE"],
};

export default function PreferenceModal({ visible, onClose, initial, onSavedLocal }: { visible: boolean; onClose: () => void; initial?: { school?: string; program?: string }; onSavedLocal?: () => void }) {
	const [school, setSchool] = useState<string>(initial?.school || "");
	const [program, setProgram] = useState<string>(initial?.program || "");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [session, setSession] = useState<any>(null);

	useEffect(() => {
		let mounted = true;
		(async () => {
			const { data } = await supabase.auth.getSession();
			if (!mounted) return;
			setSession(data.session ?? null);
		})();
		const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
		return () => sub?.subscription.unsubscribe();
	}, []);

	useEffect(() => {
		if (initial?.school) setSchool(initial.school);
		if (initial?.program) setProgram(initial.program);
	}, [initial]);

	const saveToDevice = () => {
		const payload = { school, program };
		localStorage.setItem("dc:preferences", JSON.stringify(payload));
		setMessage("Preferences saved to device.");
		// Close modal after saving locally; encourage signin with a message
			setTimeout(() => {
				setMessage("Preferences saved locally. Sign in to save them to your account.");
				if (onSavedLocal) onSavedLocal();
				onClose();
			}, 300);
	};

	const saveToAccount = async () => {
		if (!session) {
			setMessage("Sign in to save preferences to your account.");
			return;
		}
		setSaving(true);
		try {
			// Save to user metadata via Supabase Auth updateUser
			const { error } = await supabase.auth.updateUser({ data: { preferences: { school, program } } } as any);
			if (error) {
				console.error("Failed saving preferences to account", error);
				setMessage("Failed to save to account: " + (error.message || String(error)));
			} else {
				setMessage("Preferences saved to your account.");
				setTimeout(() => onClose(), 700);
			}
		} catch (err: any) {
			console.error(err);
			setMessage("Error saving preferences: " + (err?.message || String(err)));
		} finally {
			setSaving(false);
		}
	};

	if (!visible) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-lg bg-white dark:bg-gray-900 p-6 rounded shadow">
				<h3 className="text-lg font-semibold mb-3">Personalize your experience</h3>
				<p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Choose a school and program to focus content for you. You can save these to your device; sign in to persist them to your account.</p>

				<div className="grid grid-cols-1 gap-4">
					<div>
						<div className="block text-sm mb-2 font-medium">School</div>
						<div className="grid grid-cols-1 gap-2">
							{schools.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => { setSchool(s); setProgram(""); }}
									className={`text-left px-3 py-2 rounded border ${school === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-black border-gray-200'}`}
								>
									{s}
								</button>
							))}
						</div>
					</div>

					<div>
						<div className="block text-sm mb-2 font-medium">Program</div>
						<div className="grid grid-cols-1 gap-2">
							{(programsMap[school] || []).length === 0 ? (
								<div className="text-sm text-gray-500">Choose a school to see programs.</div>
							) : (
								(programsMap[school] || []).map((p) => (
									<button
										key={p}
										type="button"
										onClick={() => setProgram(p)}
										className={`text-left px-3 py-2 rounded border ${program === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-black border-gray-200'}`}
									>
										{p}
									</button>
								))
							)}
						</div>
					</div>

					{message && <div className="mt-1 text-sm text-gray-700">{message}</div>}
					<div className="mt-2 flex gap-2 justify-end">
						<button type="button" className="px-3 py-1 bg-gray-200 text-gray-900 rounded border border-gray-300 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:border-gray-600" onClick={() => onClose()} disabled={saving}>Cancel</button>
						<button
							type="button"
							className="px-3 py-1 bg-blue-600 text-white rounded"
							disabled={!school || !program || saving}
							onClick={async () => {
								if (!school || !program || saving) return;
								// If user is signed in, save to their account; otherwise save locally
								if (session) {
									await saveToAccount();
								} else {
									saveToDevice();
								}
							}}
						>
							{saving ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

