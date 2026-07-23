"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  uploadProceedingDocument,
  deleteProceedingDocument,
  uploadEventDocument,
  deleteEventDocument,
} from "@/app/(sp)/litigations/actions";

// Purpose-built attachments widget for the Guest Manager/Guest User proceeding
// view. Mirrors the visual/behavioral pattern of ProceedingAttachments /
// EventAttachments in AppealDetailClient.tsx, but is its own small
// self-contained component (that file is 6500+ lines and deeply coupled to
// its own local state — extracting from it safely was higher risk than
// writing this narrower, purpose-built version for the guest-only surface).

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface AttachedFile {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  description?: string | null;
  created_at: string;
}

export function GuestAttachments({
  scope,
  entityId,
  docs,
  canEdit,
}: {
  scope: "proceeding" | "event";
  entityId: string;
  docs: AttachedFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<{ file: File; desc: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AttachedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<AttachedFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const serverDocIds = new Set(docs.map((d) => d.id));
  const activeDocs = [
    ...docs.filter((d) => !deletedIds.has(d.id)),
    ...uploadedDocs.filter((d) => !deletedIds.has(d.id) && !serverDocIds.has(d.id)),
  ];

  useEffect(() => {
    if (uploadedDocs.length === 0) return;
    const serverIds = new Set(docs.map((d) => d.id));
    setUploadedDocs((prev) => prev.filter((d) => !serverIds.has(d.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles((prev) => [...prev, ...files.map((f) => ({ file: f, desc: "" }))]);
    e.target.value = "";
  }

  function updateDesc(idx: number, desc: string) {
    setPendingFiles((prev) => prev.map((p, i) => (i === idx ? { ...p, desc } : p)));
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    try {
      for (const { file, desc } of pendingFiles) {
        const folder = scope === "proceeding" ? "proceeding-docs" : "event-docs";
        const path = `${folder}/${entityId}/${Date.now()}-${sanitizeFileName(file.name)}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        const docId =
          scope === "proceeding"
            ? await uploadProceedingDocument(entityId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined)
            : await uploadEventDocument(entityId, file.name, urlData.publicUrl, file.size, desc.trim() || undefined);
        setUploadedDocs((prev) => [
          ...prev,
          {
            id: docId,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            description: desc.trim() || null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (scope === "proceeding") await deleteProceedingDocument(confirmDelete.id);
      else await deleteEventDocument(confirmDelete.id);
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedDocs((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-accent-tint rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
          Attachments ({activeDocs.length})
        </p>
        {canEdit && (
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg transition font-medium">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Choose Files
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.docx,.doc" className="hidden" onChange={handleFileSelect} />
          </label>
        )}
      </div>

      {error && pendingFiles.length === 0 && (
        <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">{error}</div>
      )}

      {activeDocs.length === 0 && pendingFiles.length === 0 ? (
        <p className="text-xs text-muted">{canEdit ? "No attachments. Use Choose Files to add files." : "No attachments."}</p>
      ) : activeDocs.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border bg-white">
          {activeDocs.map((doc) => (
            <div key={doc.id} className="px-3 py-2 flex items-center justify-between gap-3">
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 min-w-0 text-xs text-heading hover:text-primary truncate"
              >
                <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">{doc.file_name}</span>
                {doc.description && <span className="text-muted truncate">— {doc.description}</span>}
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(doc)}
                  className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {pendingFiles.length > 0 && (
        <div className={`${activeDocs.length > 0 ? "mt-3" : ""} rounded-lg border border-border bg-white px-4 py-3 space-y-3`}>
          {pendingFiles.map(({ file, desc }, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs text-heading font-medium truncate w-32 shrink-0">{file.name}</span>
              <input
                type="text"
                placeholder="Description (optional)"
                value={desc}
                onChange={(e) => updateDesc(idx, e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              />
              <button type="button" onClick={() => removePending(idx)} className="p-1 text-muted hover:text-red-500 transition shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleUploadAll}
              disabled={uploading}
              className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg font-medium disabled:opacity-50"
            >
              {uploading ? "Uploading…" : `Attach ${pendingFiles.length > 1 ? `All (${pendingFiles.length})` : "File"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingFiles([]);
                setError(null);
              }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-border w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Attachment?</h3>
            <p className="text-sm text-secondary mb-5">
              Delete <strong>&quot;{confirmDelete.file_name}&quot;</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
