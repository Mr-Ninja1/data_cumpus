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
	const [selectedSchool, setSelectedSchool] = useState<string>("");
	const [selectedProgram, setSelectedProgram] = useState<string>("");
	// year removed — filename will include year
	const [type, setType] = useState("Exam");
	const [files, setFiles] = useState<FileList | null>(null);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);
	const [lastError, setLastError] = useState<any>(null);

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
			alert("Please sign in before uploading.");
			return;
		}

		console.log("Upload handler session:", session);
		if (!selectedSchool || !selectedProgram || !files || files.length === 0) {
			alert("Please fill all fields and select at least one PDF.");
			return;
		}
		setLoading(true);
		setSuccess(false);
		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
				console.log("Uploading file:", { fileName, originalName: file.name });
				// Sanitize filename and path to avoid characters that can cause 400 errors
				const safeName = file.name.replace(/\s+/g, "_").replace(/,+/g, "-");
				const storagePath = `${selectedSchool}/${selectedProgram}/${Date.now()}_${safeName}`;
				console.log("Storage path:", storagePath);
				// Upload file to Supabase Storage with contentType and no upsert
				const { data: uploadData, error: uploadError } = await supabase.storage
					.from("papers")
					.upload(storagePath, file, { contentType: file.type, upsert: false });
				if (uploadError) {
					console.error("Supabase upload error:", uploadError);
					throw uploadError;
				}
				console.log("Upload response:", uploadData);
				const publicUrlRes = supabase.storage.from("papers").getPublicUrl(storagePath);
				const fileUrl = publicUrlRes?.data?.publicUrl || "";
				// store file_path so server can securely fetch the file later
				const filePath = storagePath;
				// Insert metadata into Supabase table
				const { data: insertData, error: insertError } = await supabase.from("papers").insert([
					{
						school: selectedSchool,
						program: selectedProgram,
						type,
						title: fileName,
						file_url: fileUrl,
						file_path: filePath,
					},
				]);
				console.log("Insert response:", { insertData, insertError });
				if (insertError) throw insertError;
			}
			setSuccess(true);
			// Reset form
			setSelectedSchool("");
			setSelectedProgram("");
			setType("Exam");
			setFiles(null);
		} catch (err: any) {
			console.error("Upload handler error:", err);
			setLastError(err);
			alert("Upload failed: " + (err?.message || JSON.stringify(err)));
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
				<select value={selectedProgram} onChange={e => setSelectedProgram(e.target.value)} className="w-full p-2 border rounded bg-[#0f172a] text-white" disabled={!selectedSchool}>
					<option value="">Select Program</option>
					{programs.map((prog) => (
						<option key={prog} value={prog}>{prog}</option>
					))}
				</select>
			</div>
			<div className="flex gap-4">
				<div className="flex-1">
					<label className="block mb-1 font-medium">Type</label>
					<select value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border rounded bg-[#0f172a] text-white">
						<option value="Exam">Exam</option>
						<option value="Test">Test</option>
						<option value="Other">Other</option>
					</select>
				</div>
			</div>
			<div>
				<label className="block mb-1 font-medium">Upload PDF(s)</label>
				<input type="file" accept="application/pdf" multiple onChange={e => setFiles(e.target.files)} className="w-full bg-[#0f172a] text-white" />
			</div>
			<button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Upload</button>
			{lastError && (
				<pre className="mt-4 p-3 bg-red-900 text-white text-sm overflow-auto">{JSON.stringify(serializeError(lastError), null, 2)}</pre>
			)}
		</form>
	);
}
