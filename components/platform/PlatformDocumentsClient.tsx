"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PER_PAGE_OPTIONS } from "@/lib/constants";
import {
  createForm, updateForm, deleteForm, FormInput,
  createTemplate, updateTemplate, deleteTemplate,
} from "@/app/(platform)/platform/documents/actions";

interface Form {
  id: string;
  rule_no: string | null;
  rule_heading: string;
  form_no: string | null;
  page_no: string | null;
  parallel_rule_1962: string | null;
  url: string | null;
  sort_order: number;
  created_at: string;
  form_files?: { id: string }[];
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

interface Props {
  forms: Form[];
  templates: Template[];
  canEdit: boolean;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


const blankForm: FormInput = { rule_no: "", rule_heading: "", form_no: "", page_no: "", parallel_rule_1962: "", url: "" };
const inp = "w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

function pageNums(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}
const btnPage = (active: boolean) =>
  `min-w-[36px] h-9 px-2 text-sm rounded-lg font-medium transition ${active ? "bg-[#1E3A5F] text-white" : "border border-[#E5E7EB] text-[#1A1A2E] hover:bg-[#F8F9FA]"}`;

export default function PlatformDocumentsClient({ forms, templates, canEdit }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"forms" | "templates">("forms");
  const [frmSearch, setFrmSearch] = useState("");
  const [tplSearch, setTplSearch] = useState("");
  const [frmPage, setFrmPage] = useState(1);
  const [tplPage, setTplPage] = useState(1);
  const [frmPerPage, setFrmPerPage] = useState(25);
  const [tplPerPage, setTplPerPage] = useState(25);

  // Form state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formData, setFormData] = useState<FormInput>(blankForm);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [confirmDeleteForm, setConfirmDeleteForm] = useState<Form | null>(null);

  // Template state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplFile, setTplFile] = useState<File | null>(null);
  const [tplUploading, setTplUploading] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  const [deletingTplId, setDeletingTplId] = useState<string | null>(null);
  const [confirmDeleteTpl, setConfirmDeleteTpl] = useState<Template | null>(null);

  function openAddForm() {
    setEditingForm(null); setFormData(blankForm); setFormError(null); setShowFormModal(true);
  }
  function openEditForm(f: Form) {
    setEditingForm(f);
    setFormData({ rule_no: f.rule_no ?? "", rule_heading: f.rule_heading, form_no: f.form_no ?? "", page_no: f.page_no ?? "", parallel_rule_1962: f.parallel_rule_1962 ?? "", url: f.url ?? "" });
    setFormError(null); setShowFormModal(true);
  }
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.rule_heading.trim()) { setFormError("Form description is required."); return; }
    setFormSaving(true); setFormError(null);
    try {
      if (editingForm) { await updateForm(editingForm.id, formData); } else { await createForm(formData); }
      setShowFormModal(false); router.refresh();
    } catch (err) { setFormError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setFormSaving(false); }
  }
  async function handleDeleteForm(f: Form) {
    setDeletingFormId(f.id);
    try { await deleteForm(f.id); setConfirmDeleteForm(null); router.refresh(); }
    catch (err) { alert(err instanceof Error ? err.message : "Delete failed."); }
    finally { setDeletingFormId(null); }
  }

  function openAddTemplate() {
    setEditingTemplate(null); setTplName(""); setTplDesc(""); setTplFile(null); setTplError(null); setShowTemplateModal(true);
  }
  function openEditTemplate(t: Template) {
    setEditingTemplate(t); setTplName(t.name); setTplDesc(t.description ?? ""); setTplFile(null); setTplError(null); setShowTemplateModal(true);
  }
  async function handleTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) { setTplError("Template name is required."); return; }
    if (!editingTemplate && !tplFile) { setTplError("Please select a file."); return; }
    setTplUploading(true); setTplError(null);
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, { name: tplName, description: tplDesc || undefined });
      } else {
        const supabase = createClient();
        const path = `templates/${Date.now()}-${tplFile!.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from("org-files").upload(path, tplFile!, { upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: urlData } = supabase.storage.from("org-files").getPublicUrl(uploadData.path);
        const ext = tplFile!.name.split(".").pop()?.toUpperCase();
        await createTemplate({ name: tplName, description: tplDesc || undefined, file_url: urlData.publicUrl, file_type: ext, file_size: tplFile!.size });
      }
      setShowTemplateModal(false); router.refresh();
    } catch (err) { setTplError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setTplUploading(false); }
  }
  async function handleDeleteTemplate(t: Template) {
    setDeletingTplId(t.id);
    try { await deleteTemplate(t.id); setConfirmDeleteTpl(null); router.refresh(); }
    catch (err) { alert(err instanceof Error ? err.message : "Delete failed."); }
    finally { setDeletingTplId(null); }
  }

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

  const tabs = [
    { key: "forms" as const, label: "Forms", count: forms.length },
    { key: "templates" as const, label: "Templates", count: templates.length },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1A1A2E]">Documents</h1>
        <p className="text-[#6B7280] text-sm mt-0.5">Platform-level forms reference and templates library</p>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-[#F0F2F5] p-1 rounded-lg">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === tab.key ? "bg-[#1E3A5F] text-white shadow-sm" : "text-[#6B7280] hover:text-[#1A1A2E]"}`}>
              {tab.label}
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-white/20 text-white" : "bg-white text-[#6B7280]"}`}>{tab.count}</span>
            </button>
          ))}
        </div>
        {canEdit && activeTab === "forms" && (
          <button onClick={openAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Row
          </button>
        )}
        {canEdit && activeTab === "templates" && (
          <button onClick={openAddTemplate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Upload Template
          </button>
        )}
      </div>

      {/* ── FORMS TAB ── */}
      {activeTab === "forms" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={frmSearch} onChange={(e) => { setFrmSearch(e.target.value); setFrmPage(1); }}
              placeholder="Search form no., description, rule no., uploaded on…"
              className="w-full pl-9 pr-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-white" />
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Form No.</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Form Description</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Rule No.</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Section</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-32 border-r border-[#E5E7EB]">Uploaded on</th>
                    <th className={`text-center px-4 py-3 font-semibold text-[#1A1A2E] w-20 ${canEdit ? "border-r border-[#E5E7EB]" : ""}`}>Files</th>
                    {canEdit && <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-28">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedForms.length === 0 ? (
                    <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-[#6B7280]">
                      {frmSearch ? `No results for "${frmSearch}"` : (forms.length === 0 ? `No forms added yet.${canEdit ? " Click \"Add Row\" to get started." : ""}` : "No results.")}
                    </td></tr>
                  ) : (
                    pagedForms.map((f, i) => (
                      <tr key={f.id} onClick={() => f.url ? window.open(f.url, "_blank") : undefined}
                        className={`border-b border-[#E5E7EB] ${i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"} ${f.url ? "cursor-pointer hover:bg-[#EEF2FF]" : "hover:bg-[#F0F4FA]"} transition-colors`}>
                        <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{f.form_no || "—"}</td>
                        <td className="px-4 py-3 text-[#1A1A2E] border-r border-[#E5E7EB]"><span className={f.url ? "text-[#4A6FA5] hover:underline" : ""}>{f.rule_heading}</span></td>
                        <td className="px-4 py-3 text-center text-[#1A1A2E] font-medium border-r border-[#E5E7EB]">{f.rule_no || "—"}</td>
                        <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{f.page_no || "—"}</td>
                        <td className="px-4 py-3 text-center text-[#6B7280] whitespace-nowrap border-r border-[#E5E7EB]">{fmtDate(f.created_at)}</td>
                        <td className={`px-4 py-3 text-center ${canEdit ? "border-r border-[#E5E7EB]" : ""}`}>
                          {(f.form_files ?? []).length === 0 ? (
                            <span className="text-[#9CA3AF] text-xs">—</span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-[#4A6FA5]">
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              <span className="text-xs font-semibold">{(f.form_files ?? []).length}</span>
                            </div>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-0.5">
                              <button onClick={() => openEditForm(f)} title="Edit row"
                                className="p-1.5 rounded hover:bg-[#F3F4F6] transition-colors text-[#4A6FA5] hover:text-[#1E3A5F] inline-flex">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => setConfirmDeleteForm(f)} title="Delete row"
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
          {/* Pagination */}
          <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-[#6B7280]">
              <span>Showing {frmFrom}–{frmTo} of {frmTotal} form{frmTotal !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Show</span>
                <select value={frmPerPage} onChange={(e) => { setFrmPerPage(Number(e.target.value)); setFrmPage(1); }}
                  className="px-2 py-1 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs">per page</span>
              </div>
            </div>
            {frmTotalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setFrmPage(p => Math.max(1, p - 1))} disabled={frmPageSafe === 1}
                  className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {pageNums(frmPageSafe, frmTotalPages).map((p, i) =>
                  p === "..." ? <span key={`e${i}`} className="px-1 text-[#9CA3AF] text-sm select-none">…</span>
                  : <button key={p} onClick={() => setFrmPage(p as number)} className={btnPage(p === frmPageSafe)}>{p}</button>
                )}
                <button onClick={() => setFrmPage(p => Math.min(frmTotalPages, p + 1))} disabled={frmPageSafe === frmTotalPages}
                  className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEMPLATES TAB ── */}
      {activeTab === "templates" && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input type="text" value={tplSearch} onChange={(e) => { setTplSearch(e.target.value); setTplPage(1); }}
              placeholder="Search template name or description…"
              className="w-full pl-9 pr-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-white" />
          </div>
          {pagedTemplates.length === 0 ? (
            <div className="bg-white border border-[#E5E7EB] rounded-xl p-16 text-center">
              <svg className="w-10 h-10 text-[#D1D5DB] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <p className="text-[#6B7280] text-sm">{tplSearch ? `No results for "${tplSearch}"` : "No templates uploaded yet."}</p>
              {!tplSearch && canEdit && <p className="text-[#9CA3AF] text-xs mt-1">Click &quot;Upload Template&quot; to add your first template.</p>}
            </div>
          ) : (
            <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#D1D9E6] border-b-2 border-[#B0BDD0]">
                    <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Template Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-[#1A1A2E] border-r border-[#E5E7EB]">Description</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-24 border-r border-[#E5E7EB]">Size</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-32 border-r border-[#E5E7EB]">Uploaded on</th>
                    <th className="text-center px-4 py-3 font-semibold text-[#1A1A2E] w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTemplates.map((t, i) => (
                    <tr key={t.id} onClick={() => window.open(t.file_url, "_blank")}
                      className={`border-b border-[#E5E7EB] last:border-0 ${i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"} hover:bg-[#EEF2FF] transition-colors cursor-pointer`}>
                      <td className="px-4 py-3 border-r border-[#E5E7EB]">
                        <span className="font-medium text-[#1A1A2E]">{t.name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] max-w-[200px] truncate border-r border-[#E5E7EB]">{t.description ?? "—"}</td>
                      <td className="px-4 py-3 text-center text-[#6B7280] border-r border-[#E5E7EB]">{fmtSize(t.file_size)}</td>
                      <td className="px-4 py-3 text-center text-[#6B7280] whitespace-nowrap border-r border-[#E5E7EB]">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-[#6B7280]">
              <span>Showing {tplFrom}–{tplTo} of {tplTotal} template{tplTotal !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">Show</span>
                <select value={tplPerPage} onChange={(e) => { setTplPerPage(Number(e.target.value)); setTplPage(1); }}
                  className="px-2 py-1 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-xs">per page</span>
              </div>
            </div>
            {tplTotalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setTplPage(p => Math.max(1, p - 1))} disabled={tplPageSafe === 1}
                  className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition">← Prev</button>
                {pageNums(tplPageSafe, tplTotalPages).map((p, i) =>
                  p === "..." ? <span key={`e${i}`} className="px-1 text-[#9CA3AF] text-sm select-none">…</span>
                  : <button key={p} onClick={() => setTplPage(p as number)} className={btnPage(p === tplPageSafe)}>{p}</button>
                )}
                <button onClick={() => setTplPage(p => Math.min(tplTotalPages, p + 1))} disabled={tplPageSafe === tplTotalPages}
                  className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] disabled:opacity-40 disabled:cursor-not-allowed transition">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Add/Edit Form Row ── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#1A1A2E]">{editingForm ? "Edit Row" : "Add New Row"}</h2>
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
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowFormModal(false)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
                <button type="submit" disabled={formSaving} className="flex-1 px-4 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60">
                  {formSaving ? "Saving…" : editingForm ? "Save Changes" : "Add Row"}
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
                  <input type="file" onChange={(e) => setTplFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-[#6B7280] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1E3A5F] file:text-white hover:file:bg-[#162d4a] file:cursor-pointer cursor-pointer" />
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

      {/* ── CONFIRM: Delete Form ── */}
      {confirmDeleteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-[#E5E7EB] p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-[#1A1A2E] mb-2">Delete Row?</h3>
            <p className="text-sm text-[#6B7280] mb-5">&quot;{confirmDeleteForm.rule_heading}&quot; will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteForm(null)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button onClick={() => handleDeleteForm(confirmDeleteForm)} disabled={deletingFormId === confirmDeleteForm.id}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
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
            <p className="text-sm text-[#6B7280] mb-5">&quot;{confirmDeleteTpl.name}&quot; will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTpl(null)} className="flex-1 px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#1A1A2E] hover:bg-[#F8F9FA] transition">Cancel</button>
              <button onClick={() => handleDeleteTemplate(confirmDeleteTpl)} disabled={deletingTplId === confirmDeleteTpl.id}
                className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-60">
                {deletingTplId === confirmDeleteTpl.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
