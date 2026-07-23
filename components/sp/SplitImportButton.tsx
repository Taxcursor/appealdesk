"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import BulkImportClient from "@/components/sp/BulkImportClient";
import {
  downloadClientTemplate,
  downloadTeamUserTemplate,
  downloadClientUserTemplate,
} from "@/lib/bulk-import/excel";
import type { ClientOrgOption, ImportType } from "@/lib/bulk-import/types";

const LABELS: Record<ImportType, string> = {
  clients: "Clients",
  "team-users": "Team Users",
  "client-users": "Client Users",
};

interface Props {
  addHref: string;
  addLabel: string;
  importType: ImportType;
  clientOrgs?: ClientOrgOption[];
  businessTypes?: string[];
}

export default function SplitImportButton({
  addHref,
  addLabel,
  importType,
  clientOrgs = [],
  businessTypes = [],
}: Props) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  async function handleDownload() {
    setDropdownOpen(false);
    setDownloading(true);
    try {
      if (importType === "clients") await downloadClientTemplate(businessTypes);
      else if (importType === "team-users") await downloadTeamUserTemplate();
      else await downloadClientUserTemplate(clientOrgs);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to download template");
    } finally {
      setDownloading(false);
    }
  }

  function handleOpenModal() {
    setDropdownOpen(false);
    setModalOpen(true);
  }

  function handleClose() {
    setModalOpen(false);
  }

  return (
    <>
      {/* Split button */}
      <div ref={wrapperRef} className="relative inline-flex">
        {/* Left: navigate to create form */}
        <button
          onClick={() => router.push(addHref)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-l-lg transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {addLabel}
        </button>

        {/* Divider + right chevron */}
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="px-2.5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-r-lg border-l border-white/30 transition"
          aria-label="More options"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-50 overflow-hidden">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full text-left px-4 py-2.5 text-sm text-[#1A1A2E] hover:bg-[#EEF2FF] transition flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? "Downloading..." : "Download Template"}
            </button>
            <button
              onClick={handleOpenModal}
              className="w-full text-left px-4 py-2.5 text-sm text-[#1A1A2E] hover:bg-[#EEF2FF] transition flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Excel
            </button>
          </div>
        )}
      </div>

      {/* Modal — rendered in document.body via portal to escape overflow:hidden parents */}
      {modalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <h2 className="text-lg font-semibold text-[#1A1A2E]">
                Import {LABELS[importType]}
              </h2>
              <button
                onClick={handleClose}
                className="p-1.5 text-[#6B7280] hover:text-[#1A1A2E] hover:bg-[#F8F9FA] rounded-lg transition"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6">
              <BulkImportClient
                type={importType}
                clientOrgs={clientOrgs}
                onDone={handleClose}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
