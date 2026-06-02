"use client";

import { useState } from "react";

export type PendingFile = { file: File; desc: string };

/**
 * Two-stage attachment picker for CREATE flows (new litigation, add proceeding,
 * add event / sub event) where the parent entity does not exist yet.
 *
 * Stage 1 — "Choose Files" places picked files in a local *choosing* area with a
 *           description input plus "Attach File" / "Cancel" buttons.
 * Stage 2 — "Attach File" commits them into the parent-held `files` list (shown in
 *           the ATTACHMENTS list); the parent uploads these on form submit.
 *
 * This mirrors the live ProceedingAttachments / EventAttachments UX so the
 * Attach/Cancel interaction is consistent across every litigation attachment field.
 */
export function PendingAttachments({
  files,
  onChange,
}: {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
}) {
  const [choosing, setChoosing] = useState<PendingFile[]>([]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    setChoosing((prev) => [...prev, ...picked.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  function updateChoosingDesc(idx: number, desc: string) {
    setChoosing((prev) => prev.map((p, i) => (i === idx ? { ...p, desc } : p)));
  }

  function removeChoosing(idx: number) {
    setChoosing((prev) => prev.filter((_, i) => i !== idx));
  }

  function attachAll() {
    if (!choosing.length) return;
    onChange([...files, ...choosing]);
    setChoosing([]);
  }

  function removeStaged(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-[#F8F9FA] flex items-center justify-between border-b border-[#E5E7EB]">
        <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Attachments ({files.length})</span>
        <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#E5E7EB] bg-white rounded-lg text-[#6B7280] hover:bg-[#F8F9FA] transition">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Choose Files
          <input type="file" multiple className="hidden" onChange={handleFileSelect} />
        </label>
      </div>

      {/* Empty state */}
      {files.length === 0 && choosing.length === 0 && (
        <div className="px-4 py-3 text-center text-xs text-[#9CA3AF]">No attachments. Use Choose Files to add files.</div>
      )}

      {/* Committed (staged) files — uploaded when the form is submitted */}
      {files.length > 0 && (
        <div className="divide-y divide-[#F3F4F6]">
          {files.map(({ file, desc }, idx) => (
            <div key={idx} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <svg className="w-3.5 h-3.5 text-[#4A6FA5] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#1A1A2E] truncate">{file.name}</span>
                    {file.size > 0 && <span className="text-xs text-[#9CA3AF] shrink-0">{(file.size / 1024).toFixed(0)} KB</span>}
                  </div>
                  {desc && <p className="text-xs text-[#6B7280] mt-0.5">{desc}</p>}
                </div>
              </div>
              <button type="button" onClick={() => removeStaged(idx)} title="Remove file"
                className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-red-400 hover:text-red-600 inline-flex shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Choosing files → description + Attach File / Cancel */}
      {choosing.length > 0 && (
        <div className="border-t border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3 space-y-3">
          {choosing.map(({ file, desc }, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <svg className="w-3.5 h-3.5 text-[#4A6FA5] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs text-[#1A1A2E] font-medium truncate w-32 shrink-0">{file.name}</span>
              <input
                type="text"
                placeholder="Description (optional)"
                value={desc}
                onChange={(e) => updateChoosingDesc(idx, e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E3A5F] bg-white"
              />
              <button type="button" onClick={() => removeChoosing(idx)}
                className="p-1 text-[#9CA3AF] hover:text-red-500 transition shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={attachAll}
              className="px-3 py-1 text-xs bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium">
              {choosing.length > 1 ? `Attach All (${choosing.length})` : "Attach File"}
            </button>
            <button type="button" onClick={() => setChoosing([])}
              className="px-3 py-1 text-xs border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
