"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PER_PAGE_OPTIONS } from "@/lib/constants";
import {
  createForm, updateForm, deleteForm, FormInput,
  addFormFile, deleteFormFile,
  createTemplate, updateTemplate, deleteTemplate, addTemplateFile, deleteTemplateFile,
  createResource, updateResource, deleteResource, addResourceFile, deleteResourceFile, ResourceInput,
} from "@/app/(sp)/documents/actions";

// ── Types ──────────────────────────────────────────────────────────────

interface FormFile {
  id: string;
  form_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface Form {
  id: string;
  rule_no: string | null;
  rule_heading: string;
  form_no: string | null;
  page_no: string | null;
  parallel_rule_1962: string | null;
  url: string | null;
  file_name: string | null;
  file_url: string | null;
  file_size: number | null;
  sort_order: number;
  created_at: string;
  form_files: FormFile[];
}

interface TemplateFile {
  id: string;
  template_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  template_files: TemplateFile[];
}

interface ResourceFile {
  id: string;
  resource_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface Resource {
  id: string;
  act_id: string;
  act: { id: string; name: string } | null;
  section: string | null;
  rule: string | null;
  description: string;
  author: string | null;
  created_at: string;
  resource_files: ResourceFile[];
}

interface Act {
  id: string;
  name: string;
}

interface Props {
  forms: Form[];
  templates: Template[];
  resources: Resource[];
  acts: Act[];
  canEdit: boolean;
  canDelete: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeBadge(nameOrType: string) {
  const ext = nameOrType.split(".").pop()?.toLowerCase() ?? nameOrType.toLowerCase();
  if (ext === "pdf") return { bg: "bg-red-50", text: "text-red-600", label: "PDF" };
  if (ext === "docx" || ext === "doc") return { bg: "bg-blue-50", text: "text-blue-600", label: ext.toUpperCase() };
  if (ext === "xlsx" || ext === "xls") return { bg: "bg-green-50", text: "text-green-600", label: ext.toUpperCase() };
  return { bg: "bg-gray-100", text: "text-gray-600", label: ext.toUpperCase() };
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── FormAttachments component ──────────────────────────────────────────

function FormAttachments({ formId, files, canEdit, canDelete }: { formId: string; files: FormFile[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FormFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FormFile[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const serverFileIds = new Set(files.map((f) => f.id));
  const activeFiles = [
    ...files.filter((f) => !deletedIds.has(f.id)),
    ...uploadedFiles.filter((f) => !deletedIds.has(f.id) && !serverFileIds.has(f.id)),
  ];

  useEffect(() => {
    if (uploadedFiles.length === 0) return;
    const serverIds = new Set(files.map((f) => f.id));
    setUploadedFiles((prev) => prev.filter((f) => !serverIds.has(f.id)));
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    setPendingFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUploadAll() {
    if (!pendingFiles.length) return;
    setUploading(true); setError(null);
    const supabase = createClient();
    try {
      for (const file of pendingFiles) {
        const path = `form-files/${formId}/${Date.now()}-${sanitize(file.name)}`;
        const { data, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: true });
        if (upErr || !data) throw new Error(`"${file.name}": ${upErr?.message ?? "Upload failed"}`);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(data.path);
        const ext = file.name.split(".").pop()?.toUpperCase();
        const fileId = await addFormFile(formId, file.name, urlData.publicUrl, ext, file.size);
        setUploadedFiles((prev) => [...prev, {
          id: fileId,
          form_id: formId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: ext ?? null,
          file_size: file.size,
          created_at: new Date().toISOString(),
        }]);
      }
      setPendingFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally { setUploading(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteFormFile(confirmDelete.id);
      setDeletedIds((prev) => new Set([...prev, confirmDelete.id]));
      setUploadedFiles((prev) => prev.filter((f) => f.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
      setConfirmDelete(null);
    } finally { setDeleting(false); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
          Attachments ({activeFiles.length})
        </span>
        {canEdit && (
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg cursor-pointer transition">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Files
            <input type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={handleFileSelect} />
          </label>
        )}
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 border border-border rounded-lg divide-y divide-surface-hover overflow-hidden">
          {pendingFiles.map((file, idx) => {
            const badge = fileTypeBadge(file.name);
            return (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-warning-light">
                <div className={`w-7 h-7 rounded ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                </div>
                <span className="text-xs text-heading flex-1 min-w-0 truncate">{file.name}</span>
                <span className="text-xs text-muted flex-shrink-0">{fmtSize(file.size)}</span>
                <button type="button" onClick={() => removePending(idx)}
                  className="p-1 rounded hover:bg-surface-hover text-red-400 hover:text-red-600 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
          <div className="px-3 py-2 bg-warning-light flex items-center justify-between gap-3">
            {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setPendingFiles([])}
                className="px-2.5 py-1 text-xs border border-border rounded-lg text-secondary hover:bg-page transition">
                Clear
              </button>
              <button type="button" onClick={handleUploadAll} disabled={uploading}
                className="px-2.5 py-1 text-xs bg-primary hover:bg-primary-dark text-white rounded-lg transition disabled:opacity-60">
                {uploading ? "Uploading…" : `Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded files list */}
      {activeFiles.length > 0 ? (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {activeFiles.map((f) => {
            const badge = fileTypeBadge(f.file_type ?? f.file_name);
            return (
              <div key={f.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-white hover:bg-page transition">
                <div className={`w-7 h-7 rounded ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                </div>
                <span className="text-xs font-medium text-heading flex-1 min-w-0 truncate">{f.file_name}</span>
                {f.file_size && <span className="text-xs text-muted flex-shrink-0">{fmtSize(f.file_size)}</span>}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" title="View"
                    className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </a>
                  <a href={f.file_url} download={f.file_name} title="Download"
                    className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  {canDelete && (
                    <button type="button" onClick={() => setConfirmDelete(f)} title="Delete file"
                      className="p-1.5 rounded hover:bg-surface-hover transition-colors text-red-400 hover:text-red-600 inline-flex">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : pendingFiles.length === 0 ? (
        <p className="text-xs text-muted py-1">No files attached yet.</p>
      ) : null}

      {error && pendingFiles.length === 0 && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {/* Confirm delete popup */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-border p-5 w-full max-w-xs mx-4">
            <h3 className="text-sm font-semibold text-heading mb-1">Delete file?</h3>
            <p className="text-xs text-secondary mb-2 truncate">This will permanently delete &quot;{confirmDelete.file_name}&quot;.</p>
            <p className="text-xs text-red-600 font-medium mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg text-heading hover:bg-page transition">
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="flex-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-60">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Blank state ────────────────────────────────────────────────────────

const blankForm: FormInput = { rule_no: "", rule_heading: "", form_no: "", page_no: "", parallel_rule_1962: "", url: "" };

// ── Main Component ─────────────────────────────────────────────────────

export default function DocumentsClient({ forms, templates, resources, acts, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"forms" | "templates" | "resources">("resources");

  // ── Form (IT Rules) state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);

  // Keep editingForm.form_files in sync when the server refreshes after an upload/delete
  useEffect(() => {
    if (!editingForm) return;
    const updated = forms.find((f) => f.id === editingForm.id);
    if (updated) setEditingForm(updated);
  }, [forms]); // eslint-disable-line react-hooks/exhaustive-deps
  const [formData, setFormData] = useState<FormInput>(blankForm);
  const [formNewFiles, setFormNewFiles] = useState<File[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [confirmDeleteForm, setConfirmDeleteForm] = useState<Form | null>(null);

  // ── Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [localTplFiles, setLocalTplFiles] = useState<TemplateFile[]>([]);
  const [tplNewFiles, setTplNewFiles] = useState<File[]>([]);
  const [deletingTplFileId, setDeletingTplFileId] = useState<string | null>(null);
  const [tplUploading, setTplUploading] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [deletingTplId, setDeletingTplId] = useState<string | null>(null);
  const [confirmDeleteTpl, setConfirmDeleteTpl] = useState<Template | null>(null);

  // ── Resource state
  const blankRes: ResourceInput = { act_id: "", section: "", rule: "", description: "", author: "" };
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [resData, setResData] = useState<ResourceInput>(blankRes);
  const [resNewFiles, setResNewFiles] = useState<File[]>([]);
  const [resSaving, setResSaving] = useState(false);
  const [resError, setResError] = useState<string | null>(null);
  const [deletingResId, setDeletingResId] = useState<string | null>(null);
  const [confirmDeleteRes, setConfirmDeleteRes] = useState<Resource | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [localResFiles, setLocalResFiles] = useState<ResourceFile[]>([]);

  // ── Form handlers ──────────────────────────────────────────────────

  function openAddForm() {
    setEditingForm(null);
    setFormData(blankForm);
    setFormNewFiles([]);
    setFormError(null);
    setShowFormModal(true);
  }

  function openEditForm(f: Form) {
    setEditingForm(f);
    setFormData({ rule_no: f.rule_no ?? "", rule_heading: f.rule_heading, form_no: f.form_no ?? "", page_no: f.page_no ?? "", parallel_rule_1962: f.parallel_rule_1962 ?? "", url: f.url ?? "" });
    setFormNewFiles([]);
    setFormError(null);
    setShowFormModal(true);
  }

  async function uploadFormFiles(formId: string, files: File[]) {
    const supabase = createClient();
    for (const file of files) {
      const path = `form-files/${formId}/${Date.now()}-${sanitize(file.name)}`;
      const { data: up, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: false });
      if (upErr) throw new Error(`"${file.name}": ${upErr.message}`);
      const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(up.path);
      const ext = file.name.split(".").pop()?.toUpperCase();
      await addFormFile(formId, file.name, urlData.publicUrl, ext, file.size);
    }
  }

  async function handleFormSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!formData.rule_heading.trim()) { setFormError("Form description is required."); return; }
    setFormSaving(true);
    setFormError(null);
    try {
      if (editingForm) {
        await updateForm(editingForm.id, formData);
      } else {
        const newId = await createForm(formData);
        if (formNewFiles.length > 0) await uploadFormFiles(newId, formNewFiles);
      }
      setShowFormModal(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDeleteForm(f: Form) {
    setDeletingFormId(f.id);
    try {
      await deleteForm(f.id);
      setConfirmDeleteForm(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingFormId(null);
    }
  }

  // ── Template handlers ──────────────────────────────────────────────

  function openAddTemplate() {
    setEditingTemplate(null);
    setTplName(""); setTplDesc("");
    setLocalTplFiles([]); setTplNewFiles([]);
    setTplError(null);
    setShowTemplateModal(true);
  }

  function openEditTemplate(t: Template) {
    setEditingTemplate(t);
    setTplName(t.name);
    setTplDesc(t.description ?? "");
    setLocalTplFiles(t.template_files ?? []);
    setTplNewFiles([]);
    setTplError(null);
    setShowTemplateModal(true);
  }

  async function uploadTplFiles(templateId: string, files: File[]) {
    const supabase = createClient();
    for (const file of files) {
      const path = `templates/${templateId}/${Date.now()}-${sanitize(file.name)}`;
      const { data: up, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upErr) throw new Error(`"${file.name}": ${upErr.message}`);
      const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(up.path);
      const ext = file.name.split(".").pop()?.toUpperCase();
      await addTemplateFile(templateId, file.name, urlData.publicUrl, ext, file.size);
    }
  }

  async function handleTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) { setTplError("Template name is required."); return; }
    if (!editingTemplate && tplNewFiles.length === 0) { setTplError("Please select at least one file."); return; }

    setTplUploading(true);
    setTplError(null);
    try {
      let templateId: string;
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, { name: tplName, description: tplDesc || undefined });
        templateId = editingTemplate.id;
      } else {
        templateId = await createTemplate({ name: tplName, description: tplDesc || undefined });
      }
      if (tplNewFiles.length > 0) await uploadTplFiles(templateId, tplNewFiles);
      setShowTemplateModal(false);
      router.refresh();
    } catch (err) {
      setTplError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setTplUploading(false);
    }
  }

  async function handleDeleteTplFile(fileId: string) {
    setDeletingTplFileId(fileId);
    try {
      await deleteTemplateFile(fileId);
      setLocalTplFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingTplFileId(null);
    }
  }

  async function handleDeleteTemplate(t: Template) {
    setDeletingTplId(t.id);
    try {
      await deleteTemplate(t.id);
      setConfirmDeleteTpl(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingTplId(null);
    }
  }

  // ── Resource handlers ──────────────────────────────────────────────

  function openAddResource() {
    setEditingResource(null);
    setResData(blankRes);
    setResNewFiles([]);
    setLocalResFiles([]);
    setResError(null);
    setShowResourceModal(true);
  }

  function openEditResource(r: Resource) {
    setEditingResource(r);
    setResData({ act_id: r.act_id, section: r.section ?? "", rule: r.rule ?? "", description: r.description, author: r.author ?? "" });
    setResNewFiles([]);
    setLocalResFiles(r.resource_files ?? []);
    setResError(null);
    setShowResourceModal(true);
  }

  async function uploadResFiles(resourceId: string, files: File[]) {
    const supabase = createClient();
    for (const file of files) {
      const path = `resources/${resourceId}/${Date.now()}-${file.name}`;
      const { data: up, error: upErr } = await supabase.storage.from("org-files").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(up.path);
      const ext = file.name.split(".").pop()?.toUpperCase();
      await addResourceFile(resourceId, file.name, urlData.publicUrl, ext, file.size);
    }
  }

  async function handleResourceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resData.act_id) { setResError("Act is required."); return; }
    if (!resData.description.trim()) { setResError("Description is required."); return; }
    if (!editingResource && resNewFiles.length === 0) { setResError("Please upload at least one file."); return; }
    setResSaving(true);
    setResError(null);
    try {
      if (editingResource) {
        await updateResource(editingResource.id, resData);
        if (resNewFiles.length > 0) await uploadResFiles(editingResource.id, resNewFiles);
      } else {
        const id = await createResource(resData);
        if (resNewFiles.length > 0) await uploadResFiles(id, resNewFiles);
      }
      setShowResourceModal(false);
      router.refresh();
    } catch (err) {
      setResError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setResSaving(false);
    }
  }

  async function handleDeleteResFile(fileId: string) {
    setDeletingFileId(fileId);
    try {
      await deleteResourceFile(fileId);
      setLocalResFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingFileId(null);
    }
  }

  async function handleDeleteResource(r: Resource) {
    setDeletingResId(r.id);
    try {
      await deleteResource(r.id);
      setConfirmDeleteRes(null);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingResId(null);
    }
  }

  // ── Download popup state ───────────────────────────────────────────
  interface DownloadPopupFile { file_name: string; file_url: string; file_type: string | null; file_size: number | null; }
  interface DownloadPopup { title: string; files: DownloadPopupFile[]; }
  const [downloadPopup, setDownloadPopup] = useState<DownloadPopup | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  async function triggerDownload(url: string, fileName: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  async function downloadAll(files: DownloadPopupFile[]) {
    setDownloadingAll(true);
    for (const file of files) {
      await triggerDownload(file.file_url, file.file_name);
      await new Promise((r) => setTimeout(r, 400));
    }
    setDownloadingAll(false);
  }

  // ── Search + pagination state ──────────────────────────────────────
  const [resSearch, setResSearch] = useState("");
  const [tplSearch, setTplSearch] = useState("");
  const [frmSearch, setFrmSearch] = useState("");
  const [resPage, setResPage] = useState(1);
  const [tplPage, setTplPage] = useState(1);
  const [frmPage, setFrmPage] = useState(1);
  const [resPerPage, setResPerPage] = useState(25);
  const [tplPerPage, setTplPerPage] = useState(25);
  const [frmPerPage, setFrmPerPage] = useState(25);

  const filteredResources = resources.filter((r) => {
    const q = resSearch.toLowerCase();
    return !q || (r.act?.name ?? "").toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || (r.author ?? "").toLowerCase().includes(q) || fmtDate(r.created_at).toLowerCase().includes(q);
  });
  const resTotal = filteredResources.length;
  const resTotalPages = Math.max(1, Math.ceil(resTotal / resPerPage));
  const resPageSafe = Math.min(resPage, resTotalPages);
  const resFrom = resTotal === 0 ? 0 : (resPageSafe - 1) * resPerPage + 1;
  const resTo = Math.min(resPageSafe * resPerPage, resTotal);
  const pagedResources = filteredResources.slice((resPageSafe - 1) * resPerPage, resPageSafe * resPerPage);

  const filteredTemplates = templates.filter((t) => {
    const q = tplSearch.toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
  });
  const tplTotal = filteredTemplates.length;
  const tplTotalPages = Math.max(1, Math.ceil(tplTotal / tplPerPage));
  const tplPageSafe = Math.min(tplPage, tplTotalPages);
  const tplFrom = tplTotal === 0 ? 0 : (tplPageSafe - 1) * tplPerPage + 1;
  const tplTo = Math.min(tplPageSafe * tplPerPage, tplTotal);
  const pagedTemplates = filteredTemplates.slice((tplPageSafe - 1) * tplPerPage, tplPageSafe * tplPerPage);

  const filteredForms = forms.filter((f) => {
    const q = frmSearch.toLowerCase();
    return !q || (f.form_no ?? "").toLowerCase().includes(q) || f.rule_heading.toLowerCase().includes(q) || (f.rule_no ?? "").toLowerCase().includes(q) || fmtDate(f.created_at).toLowerCase().includes(q);
  });
  const frmTotal = filteredForms.length;
  const frmTotalPages = Math.max(1, Math.ceil(frmTotal / frmPerPage));
  const frmPageSafe = Math.min(frmPage, frmTotalPages);
  const frmFrom = frmTotal === 0 ? 0 : (frmPageSafe - 1) * frmPerPage + 1;
  const frmTo = Math.min(frmPageSafe * frmPerPage, frmTotal);
  const pagedForms = filteredForms.slice((frmPageSafe - 1) * frmPerPage, frmPageSafe * frmPerPage);

  function pageNums(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }
  const btnPage = (active: boolean) =>
    `min-w-[36px] h-9 px-2 text-sm rounded-lg font-medium transition ${active ? "bg-primary text-white" : "border border-border text-heading hover:bg-page"}`;

  // ── Shared UI helpers ──────────────────────────────────────────────

  const inp = "w-full px-3 py-2 text-sm border border-accent rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";

  const tabs = [
    { key: "resources" as const, label: "Resources", count: resources.length },
    { key: "templates" as const, label: "Templates", count: templates.length },
    { key: "forms" as const, label: "Forms", count: forms.length },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + Tabs */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-heading">Documents</h1>
        <p className="text-secondary text-sm mt-0.5">Forms reference and templates library</p>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-surface-hover p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === tab.key ? "bg-primary text-white shadow-sm" : "text-secondary hover:text-heading"
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-white/20 text-white" : "bg-white text-secondary"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {canEdit && activeTab === "forms" && (
          <button onClick={openAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Form
          </button>
        )}
        {canEdit && activeTab === "templates" && (
          <button onClick={openAddTemplate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Upload Template
          </button>
        )}
        {canEdit && activeTab === "resources" && (
          <button onClick={openAddResource} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Resource
          </button>
        )}
      </div>

      {/* ── TAB: FORMS (Income Tax Rules) ── */}
      {activeTab === "forms" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={frmSearch} onChange={(e) => { setFrmSearch(e.target.value); setFrmPage(1); }}
              placeholder="Search form no., description, rule no., uploaded on…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-accent rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-nowrap">
                <thead>
                  <tr className="bg-table-header border-b-2 border-table-header-border">
                    <th className="text-center px-4 py-3 font-semibold text-heading w-10">#</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-20">Form No.</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading">Form Description</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-20">Rule No.</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-20">Section</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28 whitespace-nowrap">Uploaded on</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-16">Files</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-24">Link</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedForms.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-secondary">
                        {frmSearch ? `No results for "${frmSearch}"` : (forms.length === 0 ? `No forms added yet.${canEdit ? " Click \"Add Form\" to get started." : ""}` : "No results.")}
                      </td>
                    </tr>
                  ) : (
                    pagedForms.map((f, i) => (
                      <tr
                        key={f.id}
                        onClick={() => canEdit && openEditForm(f)}
                        className={`border-b border-border ${i % 2 === 0 ? "bg-white" : "bg-page"} hover:bg-accent-light transition-colors ${canEdit ? "cursor-pointer" : ""}`}
                      >
                        <td className="px-4 py-3 text-center text-muted text-xs">{frmFrom + i}</td>
                        <td className="px-4 py-3 text-center text-secondary">{f.form_no || "—"}</td>
                        <td className="px-4 py-3 text-secondary" title={f.rule_heading}>{f.rule_heading}</td>
                        <td className="px-4 py-3 text-center text-secondary">{f.rule_no || "—"}</td>
                        <td className="px-4 py-3 text-center text-secondary">{f.page_no || "—"}</td>
                        <td className="px-4 py-3 text-center text-secondary whitespace-nowrap">{fmtDate(f.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {(f.form_files ?? []).length === 0 ? (
                            <span className="text-muted text-xs">—</span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-accent">
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="text-xs font-semibold">{(f.form_files ?? []).length}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {f.url
                            ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:text-primary hover:underline">Click Here</a>
                            : <span className="text-border-strong">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            {(f.form_files ?? []).length > 0 && (
                              <button
                                onClick={() => setDownloadPopup({ title: f.rule_heading, files: (f.form_files ?? []).map(ff => ({ file_name: ff.file_name, file_url: ff.file_url, file_type: ff.file_type, file_size: ff.file_size })) })}
                                title="Download files"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => openEditForm(f)} title="Edit form"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setConfirmDeleteForm(f)} title="Delete form"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500 hover:text-red-700 inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination */}
          <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-secondary">
              <span>Showing {frmFrom}–{frmTo} of {frmTotal} form{frmTotal !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Show</span>
                <select value={frmPerPage} onChange={(e) => { setFrmPerPage(Number(e.target.value)); setFrmPage(1); }}
                  className="px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs">per page</span>
              </div>
            </div>
            {frmTotalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setFrmPage(p => Math.max(1, p - 1))} disabled={frmPageSafe === 1}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {pageNums(frmPageSafe, frmTotalPages).map((p, i) =>
                  p === "..." ? <span key={`e${i}`} className="px-1 text-muted text-sm select-none">…</span>
                  : <button key={p} onClick={() => setFrmPage(p as number)} className={btnPage(p === frmPageSafe)}>{p}</button>
                )}
                <button onClick={() => setFrmPage(p => Math.min(frmTotalPages, p + 1))} disabled={frmPageSafe === frmTotalPages}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: TEMPLATES ── */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={tplSearch} onChange={(e) => { setTplSearch(e.target.value); setTplPage(1); }}
              placeholder="Search template name or description…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-accent rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-nowrap">
                <thead>
                  <tr className="bg-table-header border-b-2 border-table-header-border">
                    <th className="text-center px-4 py-3 font-semibold text-heading w-10">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading w-72">Template Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading">Description</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28 whitespace-nowrap">Uploaded on</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-16">Files</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-secondary">
                        {tplSearch ? `No results for "${tplSearch}"` : (templates.length === 0 ? `No templates uploaded yet.${canEdit ? " Click \"Upload Template\" to get started." : ""}` : "No results.")}
                      </td>
                    </tr>
                  ) : (
                    pagedTemplates.map((t, i) => (
                      <tr
                        key={t.id}
                        onClick={() => canEdit && openEditTemplate(t)}
                        className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-page"} hover:bg-accent-light transition-colors ${canEdit ? "cursor-pointer" : ""}`}
                      >
                        <td className="px-4 py-3 text-center text-muted text-xs">{tplFrom + i}</td>
                        <td className="px-4 py-3 text-secondary" title={t.name}>
                          {t.name}
                        </td>
                        <td className="px-4 py-3 text-secondary truncate" title={t.description ?? ""}>{t.description ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-secondary whitespace-nowrap">{fmtDate(t.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {(t.template_files ?? []).length === 0 ? (
                            <span className="text-muted text-xs">—</span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-accent">
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="text-xs font-semibold">{(t.template_files ?? []).length}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            {(t.template_files ?? []).length > 0 && (
                              <button
                                onClick={() => setDownloadPopup({ title: t.name, files: (t.template_files ?? []).map(tf => ({ file_name: tf.file_name, file_url: tf.file_url, file_type: tf.file_type, file_size: tf.file_size })) })}
                                title="Download files"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => openEditTemplate(t)} title="Edit template"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setConfirmDeleteTpl(t)} title="Delete template"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500 hover:text-red-700 inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination */}
          <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-secondary">
              <span>Showing {tplFrom}–{tplTo} of {tplTotal} template{tplTotal !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Show</span>
                <select value={tplPerPage} onChange={(e) => { setTplPerPage(Number(e.target.value)); setTplPage(1); }}
                  className="px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs">per page</span>
              </div>
            </div>
            {tplTotalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setTplPage(p => Math.max(1, p - 1))} disabled={tplPageSafe === 1}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {pageNums(tplPageSafe, tplTotalPages).map((p, i) =>
                  p === "..." ? <span key={`e${i}`} className="px-1 text-muted text-sm select-none">…</span>
                  : <button key={p} onClick={() => setTplPage(p as number)} className={btnPage(p === tplPageSafe)}>{p}</button>
                )}
                <button onClick={() => setTplPage(p => Math.min(tplTotalPages, p + 1))} disabled={tplPageSafe === tplTotalPages}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: RESOURCES ── */}
      {activeTab === "resources" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={resSearch} onChange={(e) => { setResSearch(e.target.value); setResPage(1); }}
              placeholder="Search act, description, author, uploaded on…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-accent rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-table-header border-b-2 border-table-header-border">
                    <th className="text-center px-4 py-3 font-semibold text-heading w-10">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading w-72">Act</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-heading w-44">Author</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28 whitespace-nowrap">Uploaded on</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-16">Files</th>
                    <th className="text-center px-4 py-3 font-semibold text-heading w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedResources.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-secondary">
                        {resSearch ? `No results for "${resSearch}"` : (resources.length === 0 ? `No resources added yet.${canEdit ? " Click \"Add Resource\" to get started." : ""}` : "No results.")}
                      </td>
                    </tr>
                  ) : (
                    pagedResources.map((r, i) => (
                      <tr
                        key={r.id}
                        onClick={() => canEdit && openEditResource(r)}
                        className={`border-b border-border last:border-0 ${canEdit ? "cursor-pointer" : ""} ${i % 2 === 0 ? "bg-white" : "bg-page"} hover:bg-accent-light transition-colors`}
                      >
                        <td className="px-4 py-3 text-center text-muted text-xs">{resFrom + i}</td>
                        <td className="px-4 py-3 text-secondary truncate max-w-0" title={r.act?.name ?? ""}>{r.act?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-secondary truncate" title={r.description ?? ""}>{r.description}</td>
                        <td className="px-4 py-3 text-secondary">{r.author ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-secondary whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {(r.resource_files ?? []).length === 0 ? (
                            <span className="text-muted text-xs">—</span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-accent">
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="text-xs font-semibold">{(r.resource_files ?? []).length}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            {(r.resource_files ?? []).length > 0 && (
                              <button
                                onClick={() => setDownloadPopup({ title: r.description, files: (r.resource_files ?? []).map(rf => ({ file_name: rf.file_name, file_url: rf.file_url, file_type: rf.file_type, file_size: rf.file_size })) })}
                                title="Download files"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => openEditResource(r)} title="Edit resource"
                                className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setConfirmDeleteRes(r)} title="Delete resource"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500 hover:text-red-700 inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination */}
          <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-secondary">
              <span>Showing {resFrom}–{resTo} of {resTotal} resource{resTotal !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Show</span>
                <select value={resPerPage} onChange={(e) => { setResPerPage(Number(e.target.value)); setResPage(1); }}
                  className="px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary">
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs">per page</span>
              </div>
            </div>
            {resTotalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setResPage(p => Math.max(1, p - 1))} disabled={resPageSafe === 1}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {pageNums(resPageSafe, resTotalPages).map((p, i) =>
                  p === "..." ? <span key={`e${i}`} className="px-1 text-muted text-sm select-none">…</span>
                  : <button key={p} onClick={() => setResPage(p as number)} className={btnPage(p === resPageSafe)}>{p}</button>
                )}
                <button onClick={() => setResPage(p => Math.min(resTotalPages, p + 1))} disabled={resPageSafe === resTotalPages}
                  className="h-9 px-3 text-sm border border-border rounded-lg text-heading hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Add/Edit Form Row ── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-heading">{editingForm ? "Edit Form" : "Add New Form"}</h2>
                <button onClick={() => setShowFormModal(false)} className="text-muted hover:text-secondary">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleFormSubmit} className="px-6 py-4 space-y-3">
              {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{formError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Rule No.</label>
                  <input value={formData.rule_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, rule_no: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Form No.</label>
                  <input value={formData.form_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, form_no: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Form Description <span className="text-red-500">*</span></label>
                <input value={formData.rule_heading} onChange={(e) => setFormData((p) => ({ ...p, rule_heading: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Section</label>
                <input value={formData.page_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, page_no: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">URL <span className="text-muted">(link to form document)</span></label>
                <input
                  type="url"
                  value={formData.url ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, url: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && !/^https?:\/\//i.test(v)) {
                      setFormData((p) => ({ ...p, url: `https://${v}` }));
                    }
                  }}
                  placeholder="https://…"
                  className={inp}
                />
              </div>
              {/* Files — inline picker for Add mode */}
              {!editingForm && canEdit && (
                <div>
                  <label className="block text-xs font-medium text-secondary mb-2">Attachments</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    onChange={(e) => setFormNewFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                    className="block w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-white hover:file:bg-primary-dark file:cursor-pointer cursor-pointer"
                  />
                  {formNewFiles.length > 0 && (
                    <div className="mt-2 border border-border rounded-lg divide-y divide-surface-hover overflow-hidden">
                      {formNewFiles.map((file, idx) => {
                        const badge = fileTypeBadge(file.name);
                        return (
                          <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-warning-light">
                            <div className={`w-7 h-7 rounded ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                            </div>
                            <span className="text-xs text-heading flex-1 min-w-0 truncate">{file.name}</span>
                            <span className="text-xs text-muted flex-shrink-0">{fmtSize(file.size)}</span>
                            <button type="button" onClick={() => setFormNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded hover:bg-surface-hover text-red-400 hover:text-red-600 flex-shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted mt-1">PDF, Word, Excel, PowerPoint — multiple files allowed</p>
                </div>
              )}

              {/* Add mode footer — inside form so submit works */}
              {!editingForm && (
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowFormModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
                  <button type="submit" disabled={formSaving} className="flex-1 px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
                    {formSaving ? "Saving…" : "Add Form"}
                  </button>
                </div>
              )}
            </form>

            {/* Attachments — full manager shown in edit mode */}
            {editingForm && (
              <div className="border-t border-border px-6 py-4">
                <FormAttachments
                  formId={editingForm.id}
                  files={editingForm.form_files ?? []}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </div>
            )}

            {/* Edit mode footer — below attachments */}
            {editingForm && (
              <div className="border-t border-border px-6 py-4 flex gap-3">
                {canDelete && (
                  <button type="button" onClick={() => { setShowFormModal(false); setConfirmDeleteForm(editingForm); }}
                    className="px-4 py-2 text-sm border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition">
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setShowFormModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
                <button type="button" onClick={() => handleFormSubmit()} disabled={formSaving}
                  className="flex-1 px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
                  {formSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Add/Edit Template ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-heading">{editingTemplate ? "Edit Template" : "Upload Template"}</h2>
                <button onClick={() => setShowTemplateModal(false)} className="text-muted hover:text-secondary">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleTemplateSubmit} className="px-6 py-4 space-y-4">
              {tplError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{tplError}</div>}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Template Name <span className="text-red-500">*</span></label>
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Adjournment Letter" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Description</label>
                <textarea value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={2} placeholder="Brief description…" className={`${inp} resize-none`} />
              </div>

              {/* Files section */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">
                  {editingTemplate ? "Files" : "Upload Files"} {!editingTemplate && <span className="text-red-500">*</span>}
                </label>

                {/* Existing files in edit mode */}
                {editingTemplate && localTplFiles.length > 0 && (
                  <div className="mb-3 border border-border rounded-lg divide-y divide-border overflow-hidden">
                    {localTplFiles.map((f) => {
                      const badge = fileTypeBadge(f.file_type ?? f.file_name);
                      return (
                        <div key={f.id} className="px-3 py-2.5 flex items-center justify-between gap-3 bg-white hover:bg-page">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                            </div>
                            <span className="text-xs font-medium text-heading truncate">{f.file_name}</span>
                            {f.file_size && <span className="text-xs text-muted flex-shrink-0">{fmtSize(f.file_size)}</span>}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" title="View"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </a>
                            <a href={f.file_url} download={f.file_name} title="Download"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </a>
                            {canEdit && (
                              <button type="button" onClick={() => handleDeleteTplFile(f.id)} disabled={deletingTplFileId === f.id} title="Delete file"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 inline-flex disabled:opacity-40">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* New files picker */}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => setTplNewFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                  className="block w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-white hover:file:bg-primary-dark file:cursor-pointer cursor-pointer"
                />
                {tplNewFiles.length > 0 && (
                  <div className="mt-2 border border-border rounded-lg divide-y divide-surface-hover overflow-hidden">
                    {tplNewFiles.map((file, idx) => {
                      const badge = fileTypeBadge(file.name);
                      return (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-warning-light">
                          <div className={`w-7 h-7 rounded ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                            <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                          </div>
                          <span className="text-xs text-heading flex-1 min-w-0 truncate">{file.name}</span>
                          <span className="text-xs text-muted flex-shrink-0">{fmtSize(file.size)}</span>
                          <button type="button" onClick={() => setTplNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 rounded hover:bg-surface-hover text-red-400 hover:text-red-600 flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted mt-1">PDF, Word, Excel, PowerPoint — multiple files allowed</p>
              </div>

              <div className="flex gap-3 pt-2 pb-2">
                {editingTemplate && canDelete && (
                  <button type="button" onClick={() => { setShowTemplateModal(false); setConfirmDeleteTpl(editingTemplate); }}
                    className="px-4 py-2 text-sm border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition">
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setShowTemplateModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
                <button type="submit" disabled={tplUploading} className="flex-1 px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
                  {tplUploading ? (editingTemplate ? "Saving…" : "Uploading…") : editingTemplate ? "Save Changes" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRM: Delete Form Row ── */}
      {confirmDeleteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Form?</h3>
            <p className="text-sm text-secondary mb-2">This will permanently delete &quot;{confirmDeleteForm.rule_heading}&quot; and all its attachments.</p>
            <p className="text-xs text-red-600 font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteForm(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={() => handleDeleteForm(confirmDeleteForm)} disabled={deletingFormId === confirmDeleteForm.id} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingFormId === confirmDeleteForm.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM: Delete Template ── */}
      {confirmDeleteTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Template?</h3>
            <p className="text-sm text-secondary mb-2">This will permanently delete the template &quot;{confirmDeleteTpl.name}&quot;.</p>
            <p className="text-xs text-red-600 font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTpl(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={() => handleDeleteTemplate(confirmDeleteTpl)} disabled={deletingTplId === confirmDeleteTpl.id} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingTplId === confirmDeleteTpl.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Add/Edit Resource ── */}
      {showResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-heading">{editingResource ? "Edit Resource" : "Add Resource"}</h2>
                <button onClick={() => setShowResourceModal(false)} className="text-muted hover:text-secondary">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleResourceSubmit} className="px-6 py-4 space-y-4">
              {resError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{resError}</div>}

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Act / Regulation <span className="text-red-500">*</span></label>
                <select value={resData.act_id} onChange={(e) => setResData((p) => ({ ...p, act_id: e.target.value }))} className={inp}>
                  <option value="">Select Act…</option>
                  {acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Section</label>
                  <input value={resData.section ?? ""} onChange={(e) => setResData((p) => ({ ...p, section: e.target.value }))} placeholder="e.g. 148A" className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Rule</label>
                  <input value={resData.rule ?? ""} onChange={(e) => setResData((p) => ({ ...p, rule: e.target.value }))} placeholder="e.g. Rule 12" className={inp} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Description <span className="text-red-500">*</span></label>
                <textarea value={resData.description} onChange={(e) => setResData((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Brief description of this resource…" className={`${inp} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Author</label>
                <input value={resData.author ?? ""} onChange={(e) => setResData((p) => ({ ...p, author: e.target.value }))} placeholder="e.g. CBDT, ITAT" className={inp} />
              </div>

              {/* Files section */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-2">
                  {editingResource ? "Files" : "Upload Files"} {!editingResource && <span className="text-red-500">*</span>}
                </label>

                {editingResource && localResFiles.length > 0 && (
                  <div className="mb-3 border border-border rounded-lg divide-y divide-border overflow-hidden">
                    {localResFiles.map((f) => {
                      const badge = fileTypeBadge(f.file_type ?? f.file_name);
                      return (
                        <div key={f.id} className="px-3 py-2.5 flex items-center justify-between gap-3 bg-white hover:bg-page">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                            </div>
                            <span className="text-xs font-medium text-heading truncate">{f.file_name}</span>
                            {f.file_size && <span className="text-xs text-muted flex-shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" title="View file"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-accent hover:text-primary inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </a>
                            <a href={f.file_url} download={f.file_name} title="Download"
                              className="p-1.5 rounded hover:bg-surface-hover transition-colors text-secondary hover:text-heading inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </a>
                            {canEdit && (
                              <button type="button" onClick={() => handleDeleteResFile(f.id)} disabled={deletingFileId === f.id} title="Delete file"
                                className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-400 hover:text-red-600 inline-flex disabled:opacity-40">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => setResNewFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-white hover:file:bg-primary-dark file:cursor-pointer cursor-pointer"
                />
                {resNewFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resNewFiles.map((f, i) => {
                      const badge = fileTypeBadge(f.name);
                      return (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
                          {badge.label} <span className="text-xs opacity-70 truncate max-w-[100px]">{f.name}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted mt-1">PDF, Word, Excel, PowerPoint — multiple files allowed</p>
              </div>

              <div className="flex gap-3 pt-2 pb-2">
                {editingResource && canDelete && (
                  <button type="button" onClick={() => { setShowResourceModal(false); setConfirmDeleteRes(editingResource); }}
                    className="px-4 py-2 text-sm border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition">
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setShowResourceModal(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
                <button type="submit" disabled={resSaving} className="flex-1 px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition disabled:opacity-60">
                  {resSaving ? (editingResource ? "Saving…" : "Uploading…") : editingResource ? "Save Changes" : "Add Resource"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CONFIRM: Delete Resource ── */}
      {confirmDeleteRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-border p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-heading mb-2">Delete Resource?</h3>
            <p className="text-sm text-secondary mb-2">This will permanently delete this resource and all its attached files.</p>
            <p className="text-xs text-red-600 font-medium mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteRes(null)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-heading hover:bg-page transition">Cancel</button>
              <button onClick={() => handleDeleteResource(confirmDeleteRes)} disabled={deletingResId === confirmDeleteRes.id} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingResId === confirmDeleteRes.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DOWNLOAD POPUP ── */}
      {downloadPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setDownloadPopup(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
              <div className="min-w-0 pr-3">
                <h3 className="text-sm font-semibold text-heading">Download Files</h3>
                <p className="text-xs text-muted mt-0.5 line-clamp-2" title={downloadPopup.title}>{downloadPopup.title}</p>
              </div>
              <button onClick={() => setDownloadPopup(null)} className="p-1 text-muted hover:text-secondary flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* File list */}
            <div className="px-3 py-3 space-y-0.5 max-h-72 overflow-y-auto">
              {downloadPopup.files.map((file, i) => {
                const badge = fileTypeBadge(file.file_type ?? file.file_name);
                return (
                  <div key={i} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-page group">
                    <div className={`w-8 h-8 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-heading truncate">{file.file_name}</p>
                      {file.file_size && <p className="text-xs text-muted">{fmtSize(file.file_size)}</p>}
                    </div>
                    <button
                      onClick={() => triggerDownload(file.file_url, file.file_name)}
                      title={`Download ${file.file_name}`}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-surface-hover transition-all text-secondary hover:text-primary flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-3 border-t border-border">
              <button
                onClick={() => downloadAll(downloadPopup.files)}
                disabled={downloadingAll}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition disabled:opacity-60">
                {downloadingAll ? (
                  <span>Downloading…</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download All ({downloadPopup.files.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
