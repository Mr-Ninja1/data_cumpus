export async function downloadPaper(id: string, title?: string) {
  const res = await fetch(`/api/papers/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "Download failed");
    throw new Error(text || "Download failed");
  }
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "paper"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
