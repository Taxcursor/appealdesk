"use client";

import React, { useState } from "react";
import {
  parseClientFile,
  parseTeamUserFile,
  parseClientUserFile,
} from "@/lib/bulk-import/excel";
import {
  validateClientRows,
  validateTeamUserRows,
  validateClientUserRows,
} from "@/lib/bulk-import/validators";
import {
  validateBulkClients,
  validateBulkTeamUsers,
  validateBulkClientUsers,
  importBulkClients,
  importBulkTeamUsers,
  importBulkClientUsers,
} from "@/app/(sp)/settings/bulk-import-actions";
import type {
  ClientOrgOption,
  ImportType,
  ParsedClientRow,
  ParsedTeamUserRow,
  ParsedClientUserRow,
  ValidatedRow,
} from "@/lib/bulk-import/types";

type Step = "idle" | "preview" | "importing" | "done";
type AnyRow = ParsedClientRow | ParsedTeamUserRow | ParsedClientUserRow;

interface Props {
  type: ImportType;
  clientOrgs?: ClientOrgOption[];
  onDone?: () => void;
}

export default function BulkImportClient({ type: importType, clientOrgs = [], onDone }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow<AnyRow>[]>([]);
  const [defaultPassword, setDefaultPassword] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-uploaded
    e.target.value = "";

    setParseError(null);
    setLoading(true);

    try {
      if (importType === "clients") {
        const rows = await parseClientFile(file);
        if (rows.length > 500)
          throw new Error(
            "File has more than 500 rows. Please split into smaller files."
          );
        const pass1 = validateClientRows(rows);
        const pass2 = await validateBulkClients(pass1);
        setValidatedRows(pass2 as ValidatedRow<AnyRow>[]);
      } else if (importType === "team-users") {
        const rows = await parseTeamUserFile(file);
        if (rows.length > 500)
          throw new Error(
            "File has more than 500 rows. Please split into smaller files."
          );
        const pass1 = validateTeamUserRows(rows);
        const pass2 = await validateBulkTeamUsers(pass1);
        setValidatedRows(pass2 as ValidatedRow<AnyRow>[]);
      } else {
        const rows = await parseClientUserFile(file);
        if (rows.length > 500)
          throw new Error(
            "File has more than 500 rows. Please split into smaller files."
          );
        const pass1 = validateClientUserRows(rows, clientOrgs);
        const pass2 = await validateBulkClientUsers(pass1);
        setValidatedRows(pass2 as ValidatedRow<AnyRow>[]);
      }
      setStep("preview");
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (loading) return;
    const validRowData = validatedRows
      .filter((r) => r.status === "valid")
      .map((r) => r.row);
    if (validRowData.length === 0) return;

    if (importType !== "clients" && defaultPassword.length < 8) {
      alert("Default password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setStep("importing");
    try {
      let count = 0;
      if (importType === "clients") {
        const result = await importBulkClients(validRowData as ParsedClientRow[]);
        count = result.successCount;
      } else if (importType === "team-users") {
        const result = await importBulkTeamUsers(
          validRowData as ParsedTeamUserRow[],
          defaultPassword
        );
        count = result.successCount;
      } else {
        const result = await importBulkClientUsers(
          validRowData as ParsedClientUserRow[],
          defaultPassword
        );
        count = result.successCount;
      }
      setImportedCount(count);
      setStep("done");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Import failed");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setStep("idle");
    setValidatedRows([]);
    setDefaultPassword("");
    setParseError(null);
    setImportedCount(0);
    onDone?.();
  }

  const validRows = validatedRows.filter((r) => r.status === "valid");
  const errorRows = validatedRows.filter((r) => r.status === "error");

  return (
    <>
      {/* ── idle: single upload area ── */}
      {step === "idle" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#4A6FA5] rounded-lg p-8 cursor-pointer hover:bg-[#EEF2FF] transition">
            <svg className="w-8 h-8 text-[#4A6FA5] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-medium text-[#1A1A2E]">Click to upload .xlsx file</span>
            <span className="text-xs text-[#9CA3AF] mt-1">Max 500 rows · Max 5 MB</span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
          </label>
          {parseError && (
            <p className="text-xs text-[#DC2626]">{parseError}</p>
          )}
        </div>
      )}

      {/* ── preview: validated rows table ── */}
      {step === "preview" && (
        <div>
          {/* Summary header */}
          <p className="text-sm font-medium text-[#1A1A2E] mb-3">
            <span className="text-[#16A34A]">{validRows.length} valid</span>
            {" · "}
            <span className="text-[#DC2626]">{errorRows.length} errors</span>
          </p>

          {/* Table */}
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                    Row
                  </th>
                  {importType === "clients" && (
                    <>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        Name
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        PAN
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        Business Type
                      </th>
                    </>
                  )}
                  {(importType === "team-users" ||
                    importType === "client-users") && (
                    <>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        First Name
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        Last Name
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                        Email
                      </th>
                      {importType === "team-users" && (
                        <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                          Role
                        </th>
                      )}
                      {importType === "client-users" && (
                        <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                          Client Org
                        </th>
                      )}
                    </>
                  )}
                  <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {validatedRows.map((vr) => {
                  const isError = vr.status === "error";
                  const row = vr.row;
                  return (
                    <tr
                      key={vr.row.rowNumber}
                      className={isError ? "bg-red-50" : "bg-green-50"}
                    >
                      <td className="px-3 py-2 text-xs text-[#6B7280] border-b border-[#E5E7EB]">
                        {row.rowNumber}
                      </td>
                      {importType === "clients" && (
                        <>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedClientRow).name}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedClientRow).pan_number}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedClientRow).business_type ?? "—"}
                          </td>
                        </>
                      )}
                      {(importType === "team-users" ||
                        importType === "client-users") && (
                        <>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedTeamUserRow | ParsedClientUserRow)
                              .first_name}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedTeamUserRow | ParsedClientUserRow)
                              .last_name}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                            {(row as ParsedTeamUserRow | ParsedClientUserRow)
                              .email}
                          </td>
                          {importType === "team-users" && (
                            <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                              {(row as ParsedTeamUserRow).role}
                            </td>
                          )}
                          {importType === "client-users" && (
                            <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                              {(row as ParsedClientUserRow).client_org_name}
                            </td>
                          )}
                        </>
                      )}
                      <td className="px-3 py-2 text-xs border-b border-[#E5E7EB]">
                        {vr.status === "error" ? (
                          <span className="text-[#DC2626]">{vr.error}</span>
                        ) : (
                          <span className="text-[#16A34A]">Valid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Password field for user imports */}
          {(importType === "team-users" || importType === "client-users") && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-[#1A1A2E] mb-1">
                Default Password{" "}
                <span className="text-[#DC2626]">*</span>
              </label>
              <p className="text-xs text-[#6B7280] mb-2">
                All imported users will use this password on first login and
                will be required to change it.
              </p>
              <input
                type="password"
                value={defaultPassword}
                onChange={(e) => setDefaultPassword(e.target.value)}
                placeholder="Min. 8 characters"
                maxLength={128}
                className="w-full px-3 py-2 text-sm border-2 border-[#4A6FA5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={validRows.length === 0 || loading}
              className="px-5 py-2 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Import {validRows.length} valid rows
            </button>
          </div>
        </div>
      )}

      {/* ── importing: spinner ── */}
      {step === "importing" && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#6B7280]">Importing...</p>
          </div>
        </div>
      )}

      {/* ── done: success banner ── */}
      {step === "done" && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-base font-semibold text-[#1A1A2E]">
            {importedCount}{" "}
            {importType === "clients" ? "clients" : "users"} imported
            successfully.
            {errorRows.length > 0 &&
              ` ${errorRows.length} rows skipped.`}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onDone?.()}
              className="px-5 py-2.5 text-sm border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:bg-gray-50 transition"
            >
              Close
            </button>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition"
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </>
  );
}
