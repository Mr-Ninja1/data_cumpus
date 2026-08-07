"use client";
import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
// Styles required for react-pdf text / annotation layers
// Note: avoid importing external react-pdf CSS to keep build simple.
// We deliberately disable text and annotation layers to prevent selectable text
// and avoid requiring package CSS files that may not exist in all versions.

// At runtime try to use a worker that matches the pdfjs version from the CDN (unpkg).
// If that fails (network/CORS), fall back to the local copy at /pdf.worker.min.mjs
function setWorkerSrc() {
  const remote = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  // Attempt a HEAD request to verify availability; fall back on error.
  fetch(remote, { method: "HEAD" })
    .then((res) => {
      if (res.ok) {
        pdfjs.GlobalWorkerOptions.workerSrc = remote;
      } else {
        pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;
      }
    })
    .catch(() => {
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;
    });
}
// try common names; the final fallback is /pdf.worker.min.mjs
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

type Props = {
  fileUrl: string | ArrayBuffer | Uint8Array;
  scale?: number;
};

export default function PdfViewer({ fileUrl, scale = 1 }: Props) {
  useEffect(() => {
    setWorkerSrc();
  }, []);
  const [numPages, setNumPages] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(scale || 1);

  // measure available width and update on resize
  useEffect(() => {
    function measure() {
      const w = containerRef.current?.clientWidth || 0;
      setContainerWidth(w);
    }
    measure();
    const ro = new ResizeObserver(() => measure());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // compute page width to fit available container width and apply zoom
  const computePageWidth = (pageIndex: number) => {
    // subtract a small gutter to account for borders/scrollbar
    const gutter = 16;
    const available = Math.max(0, containerWidth - gutter);
    // if unknown, fall back to scale-based rendering (pdf.js scale prop)
    if (!available) return undefined as unknown as number;
    // allow smaller min width so pages can scale down to fit
    return Math.max(200, Math.floor(available * zoom));
  };

  return (
    <div className="h-full w-full" ref={containerRef}>
      <div className="relative overflow-auto bg-gray-100 dark:bg-gray-900 min-h-[60vh]">
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            aria-label="zoom-out"
            className="px-2 py-1 bg-white/90 dark:bg-gray-800 text-sm rounded shadow"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
          >
            −
          </button>
          <button
            aria-label="fit-width"
            className="px-2 py-1 bg-white/90 dark:bg-gray-800 text-sm rounded shadow"
            onClick={() => setZoom(1)}
          >
            Fit
          </button>
          <button
            aria-label="zoom-in"
            className="px-2 py-1 bg-white/90 dark:bg-gray-800 text-sm rounded shadow"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
          >
            +
          </button>
        </div>

        <Document
          // react-pdf File typings are stricter than runtime; string/blob URL is the common case
          file={fileUrl as string}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div>Loading document...</div>}
        >
          {Array.from(new Array(numPages || 0), (_el, index) => (
            <div key={`page_${index + 1}`} className="mb-4 w-full flex justify-start">
              <Page
                pageNumber={index + 1}
                width={computePageWidth(index)}
                loading={<div>Loading page...</div>}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
