"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { GraduationCap, BookOpen, X, Check, Loader2, AlertCircle } from "lucide-react";
import ModalPortal from "./ModalPortal";

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
	const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
	const [session, setSession] = useState<any>(null);
	const [modalVisible, setModalVisible] = useState(false);

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

	useEffect(() => {
		if (visible) {
			setTimeout(() => setModalVisible(true), 50);
		} else {
			setModalVisible(false);
		}
	}, [visible]);

	const saveToDevice = () => {
		const payload = { school, program };
		localStorage.setItem("dc:preferences", JSON.stringify(payload));
		setMessage({ type: 'success', text: 'Preferences saved to device.' });
		setTimeout(() => {
			setMessage({ type: 'success', text: 'Preferences saved locally. Sign in to save them to your account.' });
			if (onSavedLocal) onSavedLocal();
			setModalVisible(false);
			setTimeout(() => onClose(), 300);
		}, 800);
	};

	const saveToAccount = async () => {
		if (!session) {
			setMessage({ type: 'error', text: 'Sign in to save preferences to your account.' });
			return;
		}
		setSaving(true);
		try {
			const { error } = await supabase.auth.updateUser({ data: { preferences: { school, program } } } as any);
			if (error) {
				console.error("Failed saving preferences to account", error);
				setMessage({ type: 'error', text: 'Failed to save to account: ' + (error.message || String(error)) });
			} else {
				setMessage({ type: 'success', text: 'Preferences saved to your account.' });
				setTimeout(() => {
					setModalVisible(false);
					setTimeout(() => onClose(), 300);
				}, 800);
			}
		} catch (err: any) {
			console.error(err);
			setMessage({ type: 'error', text: 'Error saving preferences: ' + (err?.message || String(err)) });
		} finally {
			setSaving(false);
		}
	};

	if (!visible) return null;

	return (
		<ModalPortal>
			<div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity duration-300 ${modalVisible ? 'opacity-100' : 'opacity-0'}`}>
				<div className={`w-full max-w-lg bg-white dark:bg-gray-900 p-6 md:p-8 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 transition-all duration-300 ${modalVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
					<div className="flex items-start justify-between mb-6">
						<div className="flex items-center gap-3">
							<div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
								<GraduationCap className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
							</div>
							<div>
								<h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Personalize Your Experience</h3>
								<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose your school and program</p>
							</div>
						</div>
						<button onClick={() => { setModalVisible(false); setTimeout(() => onClose(), 300); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
							<X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
						</button>
					</div>

					<p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
						Select your school and program to personalize your content. {session ? 'Your preferences will be saved to your account.' : 'Sign in to save preferences across devices.'}
					</p>

					<div className="space-y-6">
						<div>
							<label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
								<GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
								School
							</label>
							<div className="grid grid-cols-1 gap-3">
								{schools.map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => { setSchool(s); setProgram(""); setMessage(null); }}
										className={`text-left px-4 py-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 ${
											school === s
												? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-400'
												: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
										}`}
									>
										<div className={`w-2 h-2 rounded-full ${school === s ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
										<span className={`text-sm font-medium ${school === s ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{s}</span>
									</button>
								))}
							</div>
						</div>

						<div>
							<label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
								<BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
								Program
							</label>
							<div className="grid grid-cols-1 gap-3">
								{(programsMap[school] || []).length === 0 ? (
									<div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
										<AlertCircle className="w-4 h-4" />
										Choose a school to see programs
									</div>
								) : (
									(programsMap[school] || []).map((p) => (
										<button
											key={p}
											type="button"
											onClick={() => setProgram(p)}
											className={`text-left px-4 py-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 ${
												program === p
													? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 dark:border-indigo-400'
													: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
											}`}
										>
											<div className={`w-2 h-2 rounded-full ${program === p ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
											<span className={`text-sm font-medium ${program === p ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{p}</span>
										</button>
									))
								)}
							</div>
						</div>

						{message && (
							<div className={`flex items-center gap-3 p-4 rounded-xl border ${
								message.type === 'success'
									? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
									: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
							}`}>
								{message.type === 'success' ? (
									<Check className="text-emerald-600 dark:text-emerald-400 w-5 h-5 flex-shrink-0" />
								) : (
									<AlertCircle className="text-red-600 dark:text-red-400 w-5 h-5 flex-shrink-0" />
								)}
								<p className={`text-sm ${message.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{message.text}</p>
							</div>
						)}

						<div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
							<button
								type="button"
								className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
								onClick={() => { setModalVisible(false); setTimeout(() => onClose(), 300); }}
								disabled={saving}
							>
								Cancel
							</button>
							<button
								type="button"
								className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
								disabled={!school || !program || saving}
								onClick={async () => {
									if (!school || !program || saving) return;
									if (session) {
										await saveToAccount();
									} else {
										saveToDevice();
									}
								}}
							>
								{saving ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin" />
										<span>Saving...</span>
									</>
								) : (
									<>
										<Check className="w-4 h-4" />
										<span>Save Preferences</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>
		</ModalPortal>
	);
}

