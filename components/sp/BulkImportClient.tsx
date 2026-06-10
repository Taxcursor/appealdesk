"use client";

import React, { useState, useRef } from "react";
import {
  downloadClientTemplate,
  downloadTeamUserTemplate,
  downloadClientUserTemplate,
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
  ParsedClientRow,
  ParsedTeamUserRow,
  ParsedClientUserRow,
  ValidatedRow,
} from "@/lib/bulk-import/types";

type ImportType = "clients" | "team-users" | "client-users";
type Step = "idle" | "preview" | "importing" | "done";
type AnyRow = ParsedClientRow | ParsedTeamUserRow | ParsedClientUserRow;

interface Props {
  clientOrgs: ClientOrgOption[];
}

export default function BulkImportClient({ clientOrgs }: Props) {
  const [activeType, setActiveType] = useState<ImportType | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow<AnyRow>[]>([]);
  const [defaultPassword, setDefaultPassword] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownloadTemplate(type: ImportType) {
    setParseError(null);
    setLoading(true);
    try {
      if (type === "clients") await downloadClientTemplate();
      else if (type === "team-users") await downloadTeamUserTemplate();
      else await downloadClientUserTemplate(clientOrgs);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to download template");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    type: ImportType
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-uploaded
    e.target.value = "";

    setParseError(null);
    setLoading(true);
    setActiveType(type);

    try {
      if (type === "clients") {
        const rows = await parseClientFile(file);
        if (rows.length > 500)
          throw new Error(
            "File has more than 500 rows. Please split into smaller files."
          );
        const pass1 = validateClientRows(rows);
        const pass2 = await validateBulkClients(pass1);
        setValidatedRows(pass2 as ValidatedRow<AnyRow>[]);
      } else if (type === "team-users") {
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
    const validRows = validatedRows
      .filter((r) => r.status === "valid")
      .map((r) => r.row);
    if (validRows.length === 0) return;

    if (activeType !== "clients" && defaultPassword.length < 8) {
      alert("Default password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setStep("importing");
    try {
      let count = 0;
      if (activeType === "clients") {
        const result = await importBulkClients(validRows as ParsedClientRow[]);
        count = result.successCount;
      } else if (activeType === "team-users") {
        const result = await importBulkTeamUsers(
          validRows as ParsedTeamUserRow[],
          defaultPassword
        );
        count = result.successCount;
      } else {
        const result = await importBulkClientUsers(
          validRows as ParsedClientUserRow[],
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
    setActiveType(null);
    setStep("idle");
    setValidatedRows([]);
    setDefaultPassword("");
    setParseError(null);
    setImportedCount(0);
  }

  const validRows = validatedRows.filter((r) => r.status === "valid");
  const errorRows = validatedRows.filter((r) => r.status === "error");

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#1A1A2E] mb-1">Bulk Import</h2>
      <p className="text-sm text-[#6B7280] mb-6">
        Import clients and users in bulk from an Excel file. Use this during
        initial setup.
      </p>

      {/* ── idle: three cards ── */}
      {step === "idle" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(
            [
              {
                type: "clients" as ImportType,
                label: "Clients",
                description:
                  "Import client organisations with compliance details",
              },
              {
                type: "team-users" as ImportType,
                label: "Team Users",
                description: "Import SP admin and staff users",
              },
              {
                type: "client-users" as ImportType,
                label: "Client Users",
                description: "Import client portal users",
              },
            ] as { type: ImportType; label: string; description: string }[]
          ).map(({ type, label, description }) => (
            <div
              key={type}
              className="border border-[#E5E7EB] rounded-lg p-4 flex flex-col gap-3"
            >
              <div>
                <h3 className="font-medium text-[#1A1A2E] text-sm">{label}</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">{description}</p>
              </div>
              <button
                onClick={() => handleDownloadTemplate(type)}
                disabled={loading}
                className="text-sm text-[#1E3A5F] border border-[#4A6FA5] rounded-lg px-3 py-1.5 hover:bg-[#EEF2FF] transition disabled:opacity-50"
              >
                Download Template
              </button>
              <label
                className={`flex flex-col items-center justify-center border-2 border-dashed border-[#4A6FA5] rounded-lg p-4 cursor-pointer hover:bg-[#EEF2FF] transition ${
                  loading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <span className="text-xs text-[#6B7280]">
                  Drop .xlsx file here or click to upload
                </span>
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, type)}
                  disabled={loading}
                />
              </label>
              {parseError && activeType === type && (
                <p className="text-xs text-[#DC2626]">{parseError}</p>
              )}
            </div>
          ))}
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
                  {activeType === "clients" && (
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
                  {(activeType === "team-users" ||
                    activeType === "client-users") && (
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
                      {activeType === "team-users" && (
                        <th className="px-3 py-2 text-xs font-semibold text-[#6B7280] border-b border-[#E5E7EB]">
                          Role
                        </th>
                      )}
                      {activeType === "client-users" && (
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
                {validatedRows.map((vr, idx) => {
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
                      {activeType === "clients" && (
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
                      {(activeType === "team-users" ||
                        activeType === "client-users") && (
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
                          {activeType === "team-users" && (
                            <td className="px-3 py-2 text-xs text-[#1A1A2E] border-b border-[#E5E7EB]">
                              {(row as ParsedTeamUserRow).role}
                            </td>
                          )}
                          {activeType === "client-users" && (
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
          {(activeType === "team-users" || activeType === "client-users") && (
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
            {activeType === "clients" ? "clients" : "users"} imported
            successfully.
            {errorRows.length > 0 &&
              ` ${errorRows.length} rows skipped.`}
          </p>
          <button
            onClick={handleReset}
            className="px-5 py-2.5 text-sm bg-[#1E3A5F] hover:bg-[#162d4a] text-white rounded-lg font-medium transition"
          >
            Import Another
          </button>
        </div>
      )}
    </div>
  );
}
