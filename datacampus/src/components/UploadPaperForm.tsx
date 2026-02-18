 "use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import Auth from "./Auth";

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

	// Prefill from local device preferences if available (non-blocking)
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
	const [results, setResults] = useState<Array<{ name: string; ok: boolean; error?: any }>>([]);
	const [lastError, setLastError] = useState<any>(null);
	const [message, setMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);
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
	}

	async function onDrop(e: React.DragEvent) {
		e.preventDefault();
		setMessage(null);
		const filesFromDrop = await itemsToFiles(e.dataTransfer?.items ?? null);
		if (filesFromDrop.length) {
			setFiles(filesFromDrop);
		} else {
			// fallback to DataTransfer.files
			setFiles(Array.from(e.dataTransfer?.files || []));
		}
	}

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
			return;
		}

		console.log("Upload handler session:", session);
		// validate selection: require at least one target (single program, apply-to-all, or additional schools)
		const hasPrimaryTarget = selectedSchool && (applyToAllPrograms || selectedProgram);
		const hasAdditionalTargets = applyToMultipleSchools && additionalSchools.length > 0;
		if (!hasPrimaryTarget && !hasAdditionalTargets) {
			setMessage({ type: 'error', text: 'Please select a target school/program or add other schools.' });
			return;
		}
		if (!files || files.length === 0) {
			setMessage({ type: 'error', text: 'Please select at least one PDF.' });
			return;
		}
		setLoading(true);
		setSuccess(false);
		setResults([]);
		const summary: Array<{ name: string; ok: boolean; error?: any }> = [];
		try {
			const list = Array.from(files || []);
			for (let i = 0; i < list.length; i++) {
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
					for (const t of Array.from(targets)) {
						const [sch, prog] = t.split('||');
						inserts.push({
							school: sch,
							program: prog,
							type,
							title: fileName,
							file_path: storedFile?.file_path ?? storagePath,
							file_url: '',
						});
					}
					if (inserts.length === 0) {
						summary.push({ name: file.name, ok: false, error: 'No target programs selected' });
						continue;
					}

					// Attach stored_file_id and file_path to inserts so they reference the stored blob
					for (const row of inserts) {
						row.stored_file_id = storedFile?.id ?? null;
						row.file_path = storedFile?.file_path ?? row.file_path;
					}
					const { data: insertData, error: insertError } = await supabase.from("papers").insert(inserts);
					if (insertError) {
						console.error('DB insert failed for', file.name, serializeError(insertError));
						summary.push({ name: file.name, ok: false, error: insertError });
						continue;
					}
					// success for this file
					summary.push({ name: file.name, ok: true });
				} catch (perr) {
					console.error('Error uploading/inserting', file.name, perr);
					summary.push({ name: file.name, ok: false, error: perr });
				}
			}
			setResults(summary);
			const anySuccess = summary.some(r => r.ok);
			if (anySuccess) setSuccess(true);
			// Reset form fields (leave others so user can re-run with same metadata if needed)
			setFiles(null);
		} catch (err: any) {
			console.error("Upload handler error:", err);
			setLastError(err);
			setMessage({ type: 'error', text: 'Upload failed: ' + (err?.message || JSON.stringify(err)) });
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
		<form className="max-w-xl mx-auto bg-white dark:bg-gray-900 p-6 rounded-lg shadow space-y-4" onSubmit={handleSubmit}>
			<h2 className="text-xl font-bold mb-2">Upload Past Paper</h2>
			{loading && (
				<div className="flex justify-center items-center mb-2">
					<svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
						<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
					</svg>
					<span className="ml-2 text-blue-500">Uploading...</span>
				</div>
			)}
			{success && (
				<div className="text-green-500 font-semibold mb-2">Upload successful!</div>
			)}
			{message && (
				<div className={`${message.type === 'error' ? 'bg-red-600 text-white' : message.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'} p-3 rounded mb-2`} role="status">
					{message.text}
				</div>
			)}
			<div>
				<label className="block mb-1 font-medium">School</label>
				<select value={selectedSchool} onChange={handleSchoolChange} className="w-full p-2 border rounded bg-[#0f172a] text-white">
					<option value="">Select School</option>
					{schools.map((school) => (
						<option key={school.name} value={school.name}>{school.name}</option>
					))}
				</select>
			</div>
			<div>
				<label className="block mb-1 font-medium">Program</label>
				<select value={selectedProgram} onChange={e => setSelectedProgram(e.target.value)} className="w-full p-2 border rounded bg-[#0f172a] text-white" disabled={!selectedSchool || applyToAllPrograms}>
					<option value="">Select Program</option>
					{programs.map((prog) => (
						<option key={prog} value={prog}>{prog}</option>
					))}
				</select>
			</div>
			<div className="flex items-center gap-3">
				<input id="applyAll" type="checkbox" checked={applyToAllPrograms} onChange={e => setApplyToAllPrograms(e.target.checked)} />
				<label htmlFor="applyAll" className="text-sm">Apply to all programs in selected school</label>
			</div>
			<div className="flex items-center gap-3">
				<input id="multiSchools" type="checkbox" checked={applyToMultipleSchools} onChange={e => { setApplyToMultipleSchools(e.target.checked); if (!e.target.checked) setAdditionalSchools([]); }} />
				<label htmlFor="multiSchools" className="text-sm">Also apply to other schools</label>
			</div>
			{applyToMultipleSchools && (
				<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
					{schools.filter(s => s.name !== selectedSchool).map((s) => (
						<label key={s.name} className="inline-flex items-center gap-2">
							<input
								type="checkbox"
								checked={additionalSchools.includes(s.name)}
								onChange={e => {
									const next = new Set(additionalSchools);
									if (e.target.checked) next.add(s.name); else next.delete(s.name);
									setAdditionalSchools(Array.from(next));
								}}
							/>
							<span className="text-sm">{s.name}</span>
						</label>
					))}
				</div>
			)}
			<div className="flex gap-4">
				<div className="flex-1">
					<label className="block mb-1 font-medium">Type</label>
									<select value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border rounded bg-[#0f172a] text-white">
										<option value="Exam">Exam</option>
										<option value="Test">Test</option>
										<option value="Material">Material (notes / books)</option>
									</select>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<input id="bulkMode" type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} />
				<label htmlFor="bulkMode" className="text-sm">Bulk upload (select folder)</label>
			</div>
			<div>
				<label className="block mb-1 font-medium">Upload PDF(s)</label>
				<div className="flex gap-2 items-start">
					<div
						className="flex-1 border-dashed border-2 border-gray-600 p-4 rounded bg-[#07102a]"
						onDragOver={onDragOver}
						onDrop={onDrop}
					>
						<div className="text-sm text-gray-200">Drop a folder or files here, or use the button to choose.</div>
						<input
							key={bulkMode ? 'dir' : 'file'}
							ref={fileInputRef}
							type="file"
							accept="application/pdf"
							multiple
							onChange={e => setFiles(Array.from(e.target.files || []))}
							className="w-full bg-[#0f172a] text-white mt-2"
							{...(bulkMode ? ({ webkitdirectory: 'true', directory: 'true' } as any) : {})}
						/>
					</div>
					<div className="flex flex-col gap-2">
						{bulkMode && (
							<button type="button" className="px-3 py-1 bg-gray-700 text-white rounded text-sm" onClick={() => fileInputRef.current?.click()}>
								Select folder
							</button>
						)}
						<button type="button" className="px-3 py-1 bg-gray-700 text-white rounded text-sm" onClick={() => fileInputRef.current?.click()}>
							Choose files
						</button>
					</div>
				</div>
				{bulkMode && (
					<div className="text-xs text-gray-400 mt-1">Drop a folder here or use the "Select folder" button. Folder selection/popups are browser-handled; use drag-and-drop for the smoothest experience.</div>
				)}
			</div>
			<button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Upload</button>
			{lastError && (
				<pre className="mt-4 p-3 bg-red-900 text-white text-sm overflow-auto">{JSON.stringify(serializeError(lastError), null, 2)}</pre>
			)}
			{results.length > 0 && (
				<div className="mt-4">
					<div className="font-semibold">Upload results</div>
					<div className="text-sm text-gray-400">{results.filter(r => r.ok).length} succeeded — {results.filter(r => !r.ok).length} failed</div>
					<ul className="mt-2 text-sm list-disc list-inside max-h-40 overflow-auto">
						{results.map((r) => (
							<li key={r.name} className={r.ok ? 'text-green-500' : 'text-red-400'}>
								{r.name}{!r.ok && r.error ? ` — ${String(r.error?.message || r.error)}` : ''}
							</li>
						))}
					</ul>
				</div>
			)}
		</form>
	);
}
