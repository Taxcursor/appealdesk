"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createForm, updateForm, deleteForm, removeFormFile, FormInput,
  createTemplate, updateTemplate, deleteTemplate, TemplateInput,
  createResource, updateResource, deleteResource, addResourceFile, deleteResourceFile, ResourceInput,
} from "@/app/(sp)/documents/actions";

// ── Types ──────────────────────────────────────────────────────────────

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
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
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

// ── Blank state ────────────────────────────────────────────────────────

const blankForm: FormInput = { rule_no: "", rule_heading: "", form_no: "", page_no: "", parallel_rule_1962: "", url: "" };

// ── Main Component ─────────────────────────────────────────────────────

export default function DocumentsClient({ forms, templates, resources, acts, canEdit }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"forms" | "templates" | "resources">("resources");

  // ── Form (IT Rules) state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<FormInput>(blankForm);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formCurrentFile, setFormCurrentFile] = useState<{ name: string; url: string; size: number | null } | null>(null);
  const [removingFormFile, setRemovingFormFile] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [confirmDeleteForm, setConfirmDeleteForm] = useState<Form | null>(null);

  // ── Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplFile, setTplFile] = useState<File | null>(null);
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
    setFormFile(null);
    setFormCurrentFile(null);
    setFormError(null);
    setShowFormModal(true);
  }

  function openEditForm(f: Form) {
    setEditingForm(f);
    setFormData({ rule_no: f.rule_no ?? "", rule_heading: f.rule_heading, form_no: f.form_no ?? "", page_no: f.page_no ?? "", parallel_rule_1962: f.parallel_rule_1962 ?? "", url: f.url ?? "" });
    setFormFile(null);
    setFormCurrentFile(f.file_url ? { name: f.file_name ?? f.file_url.split("/").pop() ?? "", url: f.file_url, size: f.file_size } : null);
    setFormError(null);
    setShowFormModal(true);
  }

  async function handleRemoveFormFile() {
    if (!editingForm) return;
    setRemovingFormFile(true);
    try {
      await removeFormFile(editingForm.id);
      setFormCurrentFile(null);
      router.refresh();
    } catch {
      alert("Failed to remove file.");
    } finally {
      setRemovingFormFile(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.rule_heading.trim()) { setFormError("Form description is required."); return; }
    setFormSaving(true);
    setFormError(null);
    try {
      let fileExtra: Partial<FormInput> = {};
      if (formFile) {
        const supabase = createClient();
        const path = `forms/${Date.now()}-${formFile.name}`;
        const { data: upData, error: upErr } = await supabase.storage.from("org-files").upload(path, formFile, { upsert: false, contentType: formFile.type || "application/octet-stream" });
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(upData.path);
        fileExtra = { file_name: formFile.name, file_url: urlData.publicUrl, file_size: formFile.size };
      }
      if (editingForm) {
        await updateForm(editingForm.id, { ...formData, ...fileExtra });
      } else {
        await createForm({ ...formData, ...fileExtra });
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
    setTplName(""); setTplDesc(""); setTplFile(null);
    setTplError(null);
    setShowTemplateModal(true);
  }

  function openEditTemplate(t: Template) {
    setEditingTemplate(t);
    setTplName(t.name);
    setTplDesc(t.description ?? "");
    setTplFile(null);
    setTplError(null);
    setShowTemplateModal(true);
  }

  async function handleTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) { setTplError("Template name is required."); return; }
    if (!editingTemplate && !tplFile) { setTplError("Please select a file."); return; }

    setTplUploading(true);
    setTplError(null);
    try {
      if (editingTemplate) {
        // Edit — only name/description, no file re-upload
        await updateTemplate(editingTemplate.id, { name: tplName, description: tplDesc || undefined });
      } else {
        // Upload file first
        const supabase = createClient();
        const path = `templates/${Date.now()}-${tplFile!.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("org-files")
          .upload(path, tplFile!, { upsert: false, contentType: tplFile!.type || "application/octet-stream" });
        if (uploadError) throw new Error(uploadError.message);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(uploadData.path);

        const ext = tplFile!.name.split(".").pop()?.toUpperCase();
        await createTemplate({
          name: tplName,
          description: tplDesc || undefined,
          file_url: urlData.publicUrl,
          file_type: ext,
          file_size: tplFile!.size,
        });
      }
      setShowTemplateModal(false);
      router.refresh();
    } catch (err) {
      setTplError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setTplUploading(false);
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

  // ── Shared UI helpers ──────────────────────────────────────────────

  const inp = "w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

  const tabs = [
    { key: "resources" as const, label: "Resources", count: resources.length },
    { key: "forms" as const, label: "Forms", count: forms.length },
    { key: "templates" as const, label: "Templates", count: templates.length },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + Tabs */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">Documents</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">Forms reference and templates library</p>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-[#F0F2F5] p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                activeTab === tab.key ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#6B7280] hover:text-[#1A1A2E]"
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-[#EEF2FF] text-[#4A6FA5]" : "bg-white text-[#6B7280]"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {canEdit && activeTab === "forms" && (
          <button onClick={openAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Form
          </button>
        )}
        {canEdit && activeTab === "templates" && (
          <button onClick={openAddTemplate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Upload Template
          </button>
        )}
        {canEdit && activeTab === "resources" && (
          <button onClick={openAddResource} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Resource
          </button>
        )}
      </div>

      {/* ── TAB: FORMS (Income Tax Rules) ── */}
      {activeTab === "forms" && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Rule No.</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Form Description</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Form No.</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Section</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-28 border-r border-[#E5E7EB]">Forms Link</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-28">Attachment</th>
                  {canEdit && <th className="w-28 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {forms.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-[#6B7280]">
                      No forms added yet.{canEdit && " Click \"Add Form\" to get started."}
                    </td>
                  </tr>
                ) : (
                  forms.map((f, i) => (
                    <tr
                      key={f.id}
                      onClick={() => canEdit ? openEditForm(f) : undefined}
                      className={`border-b border-[#E5E7EB] ${i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"} hover:bg-[#EEF2FF] transition-colors ${canEdit ? "cursor-pointer" : ""}`}
                    >
                      <td className="px-4 py-3 text-center text-[#1A1A2E] font-medium border-r border-[#E5E7EB]">{f.rule_no || "—"}</td>
                      <td className="px-4 py-3 text-[#1A1A2E] border-r border-[#E5E7EB]">{f.rule_heading}</td>
                      <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{f.form_no || "—"}</td>
                      <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{f.page_no || "—"}</td>
                      <td className="px-4 py-3 text-center border-r border-[#E5E7EB]" onClick={(e) => e.stopPropagation()}>
                        {f.url
                          ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#4A6FA5] hover:text-[#1E3A5F] hover:underline">Click Here</a>
                          : <span className="text-[#D1D5DB]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {f.file_url
                          ? (
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" title={f.file_name ?? "Download"}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#4A6FA5] hover:text-[#1E3A5F]">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {fileTypeBadge(f.file_name ?? f.file_url).label}
                            </a>
                          )
                          : <span className="text-[#D1D5DB]">—</span>}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            <button onClick={() => openEditForm(f)} title="Edit form"
                              className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setConfirmDeleteForm(f)} title="Delete form"
                              className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500 hover:text-red-700 inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: TEMPLATES ── */}
      {activeTab === "templates" && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] w-44 border-r border-[#E5E7EB]">Template Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Description</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-20 border-r border-[#E5E7EB]">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Size</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-28 border-r border-[#E5E7EB]">Uploaded</th>
                  <th className="w-28 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[#6B7280]">
                      No templates uploaded yet.{canEdit && " Click \"Upload Template\" to get started."}
                    </td>
                  </tr>
                ) : (
                  templates.map((t, i) => {
                    const badge = fileTypeBadge(t.file_type ?? t.name);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => window.open(t.file_url, "_blank")}
                        className={`border-b border-[#E5E7EB] last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"} hover:bg-[#EEF2FF] transition-colors cursor-pointer`}
                      >
                        <td className="px-4 py-3 border-r border-[#E5E7EB]">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                            </div>
                            <span className="font-medium text-[#1A1A2E] truncate">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#6B7280] border-r border-[#E5E7EB] truncate">{t.description ?? "—"}</td>
                        <td className="px-4 py-3 text-center border-r border-[#E5E7EB]">
                          {t.file_type && (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                              {t.file_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{fmtSize(t.file_size)}</td>
                        <td className="px-4 py-3 text-center text-[#6B7280] whitespace-nowrap border-r border-[#E5E7EB]">{fmtDate(t.created_at)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <a href={t.file_url} target="_blank" rel="noopener noreferrer" title="Download"
                              className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                            {canEdit && (
                              <>
                                <button onClick={() => openEditTemplate(t)} title="Edit template"
                                  className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => setConfirmDeleteTpl(t)} title="Delete template"
                                  className="p-1.5 rounded hover:bg-red-50 transition-colors text-red-500 hover:text-red-700 inline-flex">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: RESOURCES ── */}
      {activeTab === "resources" && (
        <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] w-44 border-r border-[#E5E7EB]">Act</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] w-36 border-r border-[#E5E7EB]">Author</th>
                  <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-20">Files</th>
                </tr>
              </thead>
              <tbody>
                {resources.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-[#6B7280]">
                      No resources added yet.{canEdit && " Click \"Add Resource\" to get started."}
                    </td>
                  </tr>
                ) : (
                  resources.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => openEditResource(r)}
                      className={`border-b border-[#E5E7EB] last:border-0 cursor-pointer ${i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"} hover:bg-[#EEF2FF] transition-colors`}
                    >
                      <td className="px-4 py-3 font-medium text-[#1A1A2E] border-r border-[#E5E7EB] truncate max-w-0">{r.act?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#6B7280] border-r border-[#E5E7EB] truncate">{r.description}</td>
                      <td className="px-4 py-3 text-[#6B7280] border-r border-[#E5E7EB]">{r.author ?? "—"}</td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {(r.resource_files ?? []).length === 0 ? (
                            <span className="text-[#9CA3AF] text-xs">—</span>
                          ) : (
                            (r.resource_files ?? []).map((f) => {
                              const badge = fileTypeBadge(f.file_type ?? f.file_name);
                              return (
                                <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" title={f.file_name}
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${badge.bg} ${badge.text} hover:opacity-80 transition`}>
                                  {badge.label}
                                </a>
                              );
                            })
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
      )}

      {/* ── MODAL: Add/Edit Form Row ── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#1A1A2E]">{editingForm ? "Edit Form" : "Add New Form"}</h2>
              <button onClick={() => setShowFormModal(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="space-y-3">
              {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{formError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Rule No.</label>
                  <input value={formData.rule_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, rule_no: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Form No.</label>
                  <input value={formData.form_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, form_no: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Form Description <span className="text-red-500">*</span></label>
                <input value={formData.rule_heading} onChange={(e) => setFormData((p) => ({ ...p, rule_heading: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Section</label>
                <input value={formData.page_no ?? ""} onChange={(e) => setFormData((p) => ({ ...p, page_no: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">URL <span className="text-[#9CA3AF]">(link to form document)</span></label>
                <input type="url" value={formData.url ?? ""} onChange={(e) => setFormData((p) => ({ ...p, url: e.target.value }))} placeholder="https://…" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-2">Attachment</label>
                {formCurrentFile ? (
                  <div className="flex items-center justify-between gap-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-lg px-3 py-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="w-3.5 h-3.5 text-[#4A6FA5] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <a href={formCurrentFile.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4A6FA5] hover:underline truncate">{formCurrentFile.name}</a>
                      {formCurrentFile.size && <span className="text-xs text-[#9CA3AF] flex-shrink-0">{(formCurrentFile.size / 1024).toFixed(0)} KB</span>}
                    </div>
                    {canEdit && (
                      <button type="button" onClick={handleRemoveFormFile} disabled={removingFormFile}
                        className="text-xs text-red-500 hover:text-red-700 flex-shrink-0 disabled:opacity-40">
                        {removingFormFile ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </div>
                ) : null}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-[#6B7280] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1E3A5F] file:text-white hover:file:bg-[#162d4a] file:cursor-pointer cursor-pointer"
                />
                {formFile && <p className="text-xs text-[#4A6FA5] mt-1">{formFile.name} selected</p>}
                <p className="text-xs text-[#9CA3AF] mt-1">PDF, Word, Excel, PowerPoint</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowFormModal(false)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
                <button type="submit" disabled={formSaving} className="flex-1 px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                  {formSaving ? "Saving…" : editingForm ? "Save Changes" : "Add Form"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Add/Edit Template ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#1A1A2E]">{editingTemplate ? "Edit Template" : "Upload Template"}</h2>
              <button onClick={() => setShowTemplateModal(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleTemplateSubmit} className="space-y-3">
              {tplError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{tplError}</div>}
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Template Name <span className="text-red-500">*</span></label>
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Adjournment Letter" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Description</label>
                <textarea value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={2} placeholder="Brief description…" className={`${inp} resize-none`} />
              </div>
              {!editingTemplate ? (
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">File <span className="text-red-500">*</span></label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => setTplFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-[#6B7280] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1E3A5F] file:text-white hover:file:bg-[#162d4a] file:cursor-pointer cursor-pointer"
                  />
                  <p className="text-xs text-[#9CA3AF] mt-1">Supported: PDF, Word (.doc, .docx), Excel (.xls, .xlsx)</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">File</label>
                  <p className="text-xs text-[#6B7280] bg-[#F8F9FA] rounded-lg px-3 py-2 truncate">{editingTemplate.file_url.split("/").pop()}</p>
                  <p className="text-xs text-[#9CA3AF] mt-1">To replace the file, delete this template and upload a new one.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTemplateModal(false)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
                <button type="submit" disabled={tplUploading} className="flex-1 px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
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
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Form?</h3>
            <p className="text-sm text-[#6B7280] mb-5">"{confirmDeleteForm.rule_heading}" will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteForm(null)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
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
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Template?</h3>
            <p className="text-sm text-[#6B7280] mb-5">"{confirmDeleteTpl.name}" will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTpl(null)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
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
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-6 pb-4 border-b border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#1A1A2E]">{editingResource ? "Edit Resource" : "Add Resource"}</h2>
                <button onClick={() => setShowResourceModal(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleResourceSubmit} className="px-6 py-4 space-y-4">
              {resError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{resError}</div>}

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Act / Regulation <span className="text-red-500">*</span></label>
                <select value={resData.act_id} onChange={(e) => setResData((p) => ({ ...p, act_id: e.target.value }))} className={inp}>
                  <option value="">Select Act…</option>
                  {acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Section</label>
                  <input value={resData.section ?? ""} onChange={(e) => setResData((p) => ({ ...p, section: e.target.value }))} placeholder="e.g. 148A" className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B7280] mb-1">Rule</label>
                  <input value={resData.rule ?? ""} onChange={(e) => setResData((p) => ({ ...p, rule: e.target.value }))} placeholder="e.g. Rule 12" className={inp} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Description <span className="text-red-500">*</span></label>
                <textarea value={resData.description} onChange={(e) => setResData((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="Brief description of this resource…" className={`${inp} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-1">Author</label>
                <input value={resData.author ?? ""} onChange={(e) => setResData((p) => ({ ...p, author: e.target.value }))} placeholder="e.g. CBDT, ITAT" className={inp} />
              </div>

              {/* Files section */}
              <div>
                <label className="block text-xs font-medium text-[#6B7280] mb-2">
                  {editingResource ? "Files" : "Upload Files"} {!editingResource && <span className="text-red-500">*</span>}
                </label>

                {/* Existing files (edit mode) */}
                {editingResource && localResFiles.length > 0 && (
                  <div className="mb-3 border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB] overflow-hidden">
                    {localResFiles.map((f) => {
                      const badge = fileTypeBadge(f.file_type ?? f.file_name);
                      return (
                        <div key={f.id} className="px-3 py-2.5 flex items-center justify-between gap-3 bg-white hover:bg-[#F8F9FA]">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                              <span className={`text-xs font-bold ${badge.text}`}>{badge.label}</span>
                            </div>
                            <span className="text-xs font-medium text-[#1A1A2E] truncate">{f.file_name}</span>
                            {f.file_size && <span className="text-xs text-[#9CA3AF] flex-shrink-0">{(f.file_size / 1024).toFixed(0)} KB</span>}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" title="View file"
                              className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </a>
                            <a href={f.file_url} download={f.file_name} title="Download"
                              className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#6B7280] hover:text-[#1A1A2E] inline-flex">
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

                {/* File picker */}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => setResNewFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-[#6B7280] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1E3A5F] file:text-white hover:file:bg-[#162d4a] file:cursor-pointer cursor-pointer"
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
                <p className="text-xs text-[#9CA3AF] mt-1">Supported: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx) — multiple files allowed</p>
              </div>

              <div className="flex gap-3 pt-2 pb-2">
                <button type="button" onClick={() => setShowResourceModal(false)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
                <button type="submit" disabled={resSaving} className="flex-1 px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
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
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Resource?</h3>
            <p className="text-sm text-[#6B7280] mb-5">This resource and all its files will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteRes(null)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button onClick={() => handleDeleteResource(confirmDeleteRes)} disabled={deletingResId === confirmDeleteRes.id} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingResId === confirmDeleteRes.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
