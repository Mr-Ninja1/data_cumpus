 "use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import Auth from "./Auth";
import { Upload, FileText, X, Check, AlertCircle, ChevronDown } from "lucide-react";
import { showToast } from "@/utils/toast";
import { useProfile } from "@/hooks/useProfile";

const schools = [
	{
		name: "School of Engineering & Technology",
		programs: [
			"Electrical & Electronics",
			"Telecommunications",
			"Instrumentation",
		],
	},
	{
		name: "School of Business",
		programs: [
			"Accountancy",
			"BBA",
			"Marketing",
			"Purchasing & Supply",
		],
	},
	{
		name: "School of Information & Communication Technology",
		programs: ["BSE", "Cyber Security", "BIT", "BICTE"],
	},
];

export default function UploadPaperForm() {
	const [session, setSession] = useState<any>(null);
	const { isTrusted } = useProfile();

	useEffect(() => {
		let mounted = true;
		(async () => {
			const { data } = await supabase.auth.getSession();
			if (!mounted) return;
			setSession(data.session ?? null);
		})();

		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session ?? null);
		});

		return () => sub?.subscription.unsubscribe();
	}, []);

  // Prefill from preferences context
  useEffect(() => {
    try {
      const raw = localStorage.getItem('dc:preferences');
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.school && !selectedSchool) setSelectedSchool(p.school);
        if (p?.program && !selectedProgram) setSelectedProgram(p.program);
      }
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
	const [selectedSchool, setSelectedSchool] = useState<string>("");
	const [selectedProgram, setSelectedProgram] = useState<string>("");
	const [applyToAllPrograms, setApplyToAllPrograms] = useState<boolean>(false);
	const [applyToMultipleSchools, setApplyToMultipleSchools] = useState<boolean>(false);
	const [additionalSchools, setAdditionalSchools] = useState<string[]>([]);
	// year removed — filename will include year
	const [type, setType] = useState("Exam");
	const [files, setFiles] = useState<File[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [bulkMode, setBulkMode] = useState(false);
	const [results, setResults] = useState<Array<{ name: string; ok: boolean; error?: any; queued?: boolean }>>([]);
	const [lastError, setLastError] = useState<any>(null);
	const [message, setMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number>(0);
	const [dragActive, setDragActive] = useState(false);
	const fileInputRef = React.useRef<HTMLInputElement | null>(null);

	async function hashFileSHA256(file: File) {
		const buffer = await file.arrayBuffer();
		const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	// Helpers to accept folder drops via DataTransferItem.webkitGetAsEntry
	async function entryToFiles(entry: any): Promise<File[]> {
		if (!entry) return [];
		if (entry.isFile) {
			return new Promise((res) => entry.file((file: File) => res([file])));
		}
		if (entry.isDirectory) {
			const reader = entry.createReader();
			const readEntries = () => new Promise<any[]>((res, rej) => reader.readEntries((entries: any[]) => res(entries), rej));
			let entries: any[] = [];
			let chunk: any[] = await readEntries();
			while (chunk.length) {
				entries = entries.concat(chunk);
				chunk = await readEntries();
			}
			const files: File[] = [];
			for (const e of entries) {
				files.push(...(await entryToFiles(e)));
			}
			return files;
		}
		return [];
	}

	async function itemsToFiles(items: DataTransferItemList | null): Promise<File[]> {
		if (!items) return [];
		const files: File[] = [];
		for (let i = 0; i < items.length; i++) {
			const item: any = items[i];
			if (item.kind === 'file') {
				if (item.webkitGetAsEntry) {
					const entry = item.webkitGetAsEntry();
					if (entry) {
						files.push(...(await entryToFiles(entry)));
					}
				} else if (item.getAsFile) {
					const f = item.getAsFile();
					if (f) files.push(f);
				}
			}
		}
		return files;
	}

	function onDragOver(e: React.DragEvent) {
		e.preventDefault();
		setDragActive(true);
	}

	function onDragLeave(e: React.DragEvent) {
		e.preventDefault();
		setDragActive(false);
	}

	async function onDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragActive(false);
		setMessage(null);
		const filesFromDrop = await itemsToFiles(e.dataTransfer?.items ?? null);
		if (filesFromDrop.length) {
			setFiles(filesFromDrop);
		} else {
			// fallback to DataTransfer.files
			setFiles(Array.from(e.dataTransfer?.files || []));
		}
	}

	const removeFile = (index: number) => {
		if (files) {
			setFiles(files.filter((_, i) => i !== index));
		}
	};

	function serializeError(err: any) {
		if (!err) return null;
		try {
			if (typeof err === "string") return err;
			const plain: any = {};
			Object.getOwnPropertyNames(err).forEach((k) => {
				plain[k] = err[k];
			});
			return plain;
		} catch (e) {
			return { message: String(err) };
		}
	}

	const handleSchoolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedSchool(e.target.value);
		setSelectedProgram("");
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!session) {
			setMessage({ type: 'error', text: 'Please sign in before uploading.' });
			showToast('error', 'Please sign in before uploading.');
			return;
		}

		console.log("Upload handler session:", session);
		// validate selection: require at least one target (single program, apply-to-all, or additional schools)
		const hasPrimaryTarget = selectedSchool && (applyToAllPrograms || selectedProgram);
		const hasAdditionalTargets = applyToMultipleSchools && additionalSchools.length > 0;
		if (!hasPrimaryTarget && !hasAdditionalTargets) {
			setMessage({ type: 'error', text: 'Please select a target school/program or add other schools.' });
			showToast('error', 'Please select a target school/program.');
			return;
		}
		if (!files || files.length === 0) {
			setMessage({ type: 'error', text: 'Please select at least one PDF.' });
			showToast('error', 'Please select at least one PDF.');
			return;
		}
		setLoading(true);
		setSuccess(false);
		setResults([]);
		setUploadProgress(0);
		const summary: Array<{ name: string; ok: boolean; error?: any; queued?: boolean }> = [];
		try {
			const list = Array.from(files || []);
			for (let i = 0; i < list.length; i++) {
				setUploadProgress(Math.round(((i + 1) / list.length) * 100));
				const file = list[i];
				const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
				console.log("Uploading file:", { fileName, originalName: file.name });
				// Sanitize filename and path to avoid characters that can cause 400 errors
				const safeName = file.name.replace(/\s+/g, "_").replace(/,+/g, "-");
				// Choose a storage path. If file applies to multiple programs/schools, place under a shared prefix.
				let storagePrefix = selectedSchool || 'shared';
				if (applyToAllPrograms || applyToMultipleSchools) storagePrefix = `${storagePrefix}/shared`;
				const storagePath = `${storagePrefix}/${Date.now()}_${safeName}`;
				console.log("Storage path:", storagePath);
				try {
					// Compute content hash and look up or create a `stored_files` record
					const fileHash = await hashFileSHA256(file);
					let storedFile: any = null;
					try {
						const { data: existingSF } = await supabase.from('stored_files').select('*').eq('file_hash', fileHash).limit(1);
						if (existingSF && Array.isArray(existingSF) && existingSF.length > 0) storedFile = existingSF[0];
					} catch (qerr) {
						console.warn('Error querying stored_files by hash:', qerr);
					}

					if (!storedFile) {
						// Upload file to Supabase Storage with contentType and no upsert
						const { data: uploadData, error: uploadError } = await supabase.storage
							.from("papers")
							.upload(storagePath, file, { contentType: file.type, upsert: false });
						if (uploadError) {
							console.error("Supabase upload error:", uploadError);
							summary.push({ name: file.name, ok: false, error: uploadError });
							continue;
						}
						const filePath = storagePath;

						// Try to create a stored_files row; on conflict, select the existing row
						try {
							const { data: ins, error: insErr } = await supabase.from('stored_files').insert({ file_path: filePath, file_hash: fileHash }).select().limit(1);
							if (insErr) {
								const { data: sf2 } = await supabase.from('stored_files').select('*').eq('file_hash', fileHash).limit(1);
								if (sf2 && sf2.length > 0) storedFile = sf2[0];
								else {
									console.error('Failed to create or find stored_files row', insErr);
									summary.push({ name: file.name, ok: false, error: insErr });
									continue;
								}
							} else {
								storedFile = ins && ins.length ? ins[0] : null;
							}
						} catch (serr) {
							console.error('Error inserting into stored_files:', serr);
							const { data: sf3 } = await supabase.from('stored_files').select('*').eq('file_hash', fileHash).limit(1);
							if (sf3 && sf3.length > 0) storedFile = sf3[0];
						}
					} else {
						console.log('Reusing existing stored file for', file.name, storedFile.file_path);
					}
					// Build target rows: support apply-to-all-programs and additional schools (insert one metadata row per school/program)
					const targets = new Set<string>();
					if (selectedSchool) {
						if (applyToAllPrograms) {
							const progs = schools.find(s => s.name === selectedSchool)?.programs || [];
							for (const p of progs) targets.add(`${selectedSchool}||${p}`);
						} else if (selectedProgram) {
							targets.add(`${selectedSchool}||${selectedProgram}`);
						}
					}
					if (applyToMultipleSchools && additionalSchools.length) {
						for (const sch of additionalSchools) {
							const progs = schools.find(s => s.name === sch)?.programs || [];
							for (const p of progs) targets.add(`${sch}||${p}`);
						}
					}
					const inserts: any[] = [];
					const uploaderId = session.user?.id;
					for (const t of Array.from(targets)) {
						const [sch, prog] = t.split('||');
						inserts.push({
							school: sch,
							program: prog,
							type,
							title: fileName,
							file_path: storedFile?.file_path ?? storagePath,
							file_url: '',
							stored_file_id: storedFile?.id ?? null,
							uploader_id: uploaderId,
						});
					}
					if (inserts.length === 0) {
						summary.push({ name: file.name, ok: false, error: 'No target programs selected' });
						continue;
					}

					// Trusted contributors publish live; others go to moderation queue
					let insertError: any = null;
					let pendingErr: any = null;
					if (isTrusted) {
						const liveInserts = inserts.map(({ uploader_id, ...rest }) => ({
							...rest,
							uploaded_by: uploader_id,
						}));
						const { error: liveErr } = await supabase.from("papers").insert(liveInserts);
						if (liveErr) {
							const bare = liveInserts.map(({ uploaded_by, ...rest }) => rest);
							const { error: bareErr } = await supabase.from("papers").insert(bare);
							insertError = bareErr || liveErr;
						}
					} else {
						const { error: pErr } = await supabase.from("pending_papers").insert(inserts);
						pendingErr = pErr;
						if (pendingErr) {
							console.warn("pending_papers insert failed, falling back to papers:", pendingErr.message);
							const liveInserts = inserts.map(({ uploader_id, ...rest }) => ({
								...rest,
								uploaded_by: uploader_id,
							}));
							const { error: liveErr } = await supabase.from("papers").insert(liveInserts);
							if (liveErr) {
								const bare = liveInserts.map(({ uploaded_by, ...rest }) => rest);
								const { error: bareErr } = await supabase.from("papers").insert(bare);
								insertError = bareErr || liveErr;
							}
						}
					}
					if (insertError) {
						console.error('DB insert failed for', file.name, serializeError(insertError));
						summary.push({ name: file.name, ok: false, error: insertError });
						continue;
					}
					// success for this file
					summary.push({ name: file.name, ok: true, queued: !isTrusted && !pendingErr });
				} catch (perr) {
					console.error('Error uploading/inserting', file.name, perr);
					summary.push({ name: file.name, ok: false, error: perr });
				}
			}
			setResults(summary);
			const anySuccess = summary.some(r => r.ok);
			const failCount = summary.filter(r => !r.ok).length;
			const queuedCount = summary.filter((r: any) => r.ok && r.queued).length;
			if (anySuccess) {
				setSuccess(true);
				if (queuedCount > 0 && queuedCount === summary.filter(r => r.ok).length) {
					showToast('success', 'Submitted for review — it will go live after approval');
				} else if (failCount) {
					showToast('success', `Uploaded with ${failCount} failure${failCount === 1 ? '' : 's'}`);
				} else {
					showToast('success', `Uploaded ${summary.filter(r => r.ok).length} file${summary.filter(r => r.ok).length === 1 ? '' : 's'}`);
				}
			} else {
				showToast('error', 'Upload failed for all files');
			}
			// Reset form fields (leave others so user can re-run with same metadata if needed)
			setFiles(null);
			setUploadProgress(100);
		} catch (err: any) {
			console.error("Upload handler error:", err);
			setLastError(err);
			setMessage({ type: 'error', text: 'Upload failed: ' + (err?.message || JSON.stringify(err)) });
			showToast('error', 'Upload failed: ' + (err?.message || 'Unknown error'));
		}
		setLoading(false);
	};

	const programs = schools.find((s) => s.name === selectedSchool)?.programs || [];

	if (!session) {
		return (
			<div className="max-w-xl mx-auto p-6">
				<Auth />
			</div>
		);
	}

	return (
		<form className="max-w-2xl mx-auto bg-white dark:bg-gray-900 p-6 md:p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 space-y-6" onSubmit={handleSubmit}>
				<div className="flex items-center gap-3 mb-6">
					<div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
						<Upload className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
					</div>
					<div>
						<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Upload Past Paper</h2>
						<p className="text-sm text-gray-500 dark:text-gray-400">Submissions go to review before going live</p>
					</div>
				</div>

				{loading && (
					<div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
						<div className="flex items-center justify-between mb-2">
							<span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Uploading files...</span>
							<span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{uploadProgress}%</span>
						</div>
						<div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2 overflow-hidden">
							<div className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
						</div>
					</div>
				)}

				{success && (
					<div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
						<div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
							<Check className="text-emerald-600 dark:text-emerald-400 w-5 h-5" />
						</div>
						<div>
							<p className="font-semibold text-emerald-700 dark:text-emerald-300">Upload successful!</p>
							<p className="text-sm text-emerald-600 dark:text-emerald-400">Your papers have been uploaded.</p>
						</div>
					</div>
				)}

				{message && (
					<div className={`${message.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'} border rounded-xl p-4 flex items-center gap-3`} role="status">
						{message.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
						<p className="font-medium">{message.text}</p>
					</div>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">School</label>
						<select value={selectedSchool} onChange={handleSchoolChange} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
							<option value="">Select School</option>
							{schools.map((school) => (
								<option key={school.name} value={school.name}>{school.name}</option>
							))}
						</select>
					</div>
					<div>
						<label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">Program</label>
						<select value={selectedProgram} onChange={e => setSelectedProgram(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed" disabled={!selectedSchool || applyToAllPrograms}>
							<option value="">Select Program</option>
							{programs.map((prog) => (
								<option key={prog} value={prog}>{prog}</option>
							))}
						</select>
					</div>
				</div>

				<div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
					<input id="applyAll" type="checkbox" checked={applyToAllPrograms} onChange={e => setApplyToAllPrograms(e.target.checked)} className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 focus:ring-offset-0" />
					<label htmlFor="applyAll" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Apply to all programs in selected school</label>
				</div>

				<div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
					<input id="multiSchools" type="checkbox" checked={applyToMultipleSchools} onChange={e => { setApplyToMultipleSchools(e.target.checked); if (!e.target.checked) setAdditionalSchools([]); }} className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 focus:ring-offset-0" />
					<label htmlFor="multiSchools" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Also apply to other schools</label>
				</div>

				{applyToMultipleSchools && (
					<div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2">
						<p className="text-sm font-medium text-gray-700 dark:text-gray-300">Select additional schools:</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{schools.filter(s => s.name !== selectedSchool).map((s) => (
								<label key={s.name} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
									<input
										type="checkbox"
										checked={additionalSchools.includes(s.name)}
										onChange={e => {
											const next = new Set(additionalSchools);
											if (e.target.checked) next.add(s.name); else next.delete(s.name);
											setAdditionalSchools(Array.from(next));
										}}
										className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 focus:ring-offset-0"
									/>
									<span className="text-sm text-gray-700 dark:text-gray-300">{s.name}</span>
								</label>
							))}
						</div>
					</div>
				)}

				<div>
					<label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">Type</label>
					<select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
						<option value="Exam">Exam</option>
						<option value="Test">Test</option>
						<option value="Material">Material (notes / books)</option>
					</select>
				</div>

				<div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
					<input id="bulkMode" type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 focus:ring-offset-0" />
					<label htmlFor="bulkMode" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Bulk upload (select folder)</label>
				</div>

				<div>
					<label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">Upload PDF(s)</label>
					<div
						className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
							dragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500'
						}`}
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						onDrop={onDrop}
					>
						<div className="flex flex-col items-center justify-center space-y-4">
							<div className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
								<Upload className="text-indigo-600 dark:text-indigo-400 w-8 h-8" />
							</div>
							<div className="text-center">
								<p className="text-gray-700 dark:text-gray-300 font-medium">Drop files or folders here</p>
								<p className="text-sm text-gray-500 dark:text-gray-400">or click to browse</p>
							</div>
							<input
								key={bulkMode ? 'dir' : 'file'}
								ref={fileInputRef}
								type="file"
								accept="application/pdf"
								multiple
								onChange={e => setFiles(Array.from(e.target.files || []))}
								className="hidden"
								{...(bulkMode ? ({ webkitdirectory: 'true', directory: 'true' } as any) : {})}
							/>
							<button type="button" onClick={() => fileInputRef.current?.click()} className="px-6 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors">
								Choose files
							</button>
						</div>
					</div>

					{files && files.length > 0 && (
						<div className="mt-4 space-y-2">
							<p className="text-sm font-medium text-gray-700 dark:text-gray-300">Selected files ({files.length})</p>
							<div className="max-h-48 overflow-y-auto space-y-2">
								{files.map((file, index) => (
									<div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
										<FileText className="text-gray-400 w-5 h-5 flex-shrink-0" />
										<span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
										<span className="text-xs text-gray-500 dark:text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
										<button
											type="button"
											onClick={() => removeFile(index)}
											className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
										>
											<X size={16} className="text-red-500" />
										</button>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<button type="submit" disabled={loading} className="w-full py-4 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
					{loading ? (
						<>
							<svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
							</svg>
							<span>Uploading...</span>
						</>
					) : (
						<>
							<Upload size={20} />
							<span>Upload Paper</span>
						</>
					)}
				</button>

				{lastError && (
					<div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
						<div className="flex items-center gap-2 mb-2">
							<AlertCircle className="text-red-600 dark:text-red-400 w-5 h-5" />
							<span className="font-semibold text-red-700 dark:text-red-300">Error Details</span>
						</div>
						<pre className="text-xs text-red-600 dark:text-red-400 overflow-auto max-h-40">{JSON.stringify(serializeError(lastError), null, 2)}</pre>
					</div>
				)}

				{results.length > 0 && (
					<div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
						<div className="flex items-center justify-between mb-3">
							<span className="font-semibold text-gray-900 dark:text-gray-100">Upload Results</span>
							<span className="text-sm text-gray-500 dark:text-gray-400">{results.filter(r => r.ok).length} succeeded — {results.filter(r => !r.ok).length} failed</span>
						</div>
						<ul className="space-y-2 max-h-40 overflow-auto">
							{results.map((r) => (
								<li key={r.name} className={`flex items-center gap-2 p-2 rounded-lg ${r.ok ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
									{r.ok ? (
										<Check className="text-emerald-600 dark:text-emerald-400 w-4 h-4 flex-shrink-0" />
									) : (
										<AlertCircle className="text-red-600 dark:text-red-400 w-4 h-4 flex-shrink-0" />
									)}
									<span className={`text-sm ${r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{r.name}</span>
									{!r.ok && r.error && <span className="text-xs text-red-500 dark:text-red-400 ml-auto truncate max-w-xs">— {String(r.error?.message || r.error)}</span>}
								</li>
							))}
						</ul>
					</div>
				)}
			</form>
		);
}
