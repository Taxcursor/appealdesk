// lib/bulk-import/excel.ts
// Client-only — uses browser APIs (Blob, URL.createObjectURL)

import { INDIAN_STATES } from "@/lib/constants";
import type { ClientOrgOption, ParsedClientRow, ParsedTeamUserRow, ParsedClientUserRow } from "./types";
import { BUSINESS_TYPES, ROLES } from "./validators";
const DATA_START_ROW = 2; // row 1 = header, data starts row 2
const MAX_DATA_ROW = 501; // 500 data rows max (rows 2–501)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getExcelJS() {
  // exceljs is CJS; .default holds the namespace under Next.js webpack interop
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("exceljs");
  return (mod.default ?? (mod as any)) as any;
}

function styleHeaderRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FF1E3A5F" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF4A6FA5" } } };
    cell.alignment = { vertical: "middle", wrapText: false };
  });
}

function styleExampleRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { italic: true, color: { argb: "FF9CA3AF" } };
  });
}

function addDropdownValidation(sheet: any, colIndex: number, listFormula: string) {
  for (let r = DATA_START_ROW; r <= MAX_DATA_ROW; r++) {
    sheet.getCell(r, colIndex).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [listFormula],
    };
  }
}

// Populate a hidden _Lists sheet and return cell range references for each list
function buildListsSheet(sheet: any, lists: string[][]): string[] {
  sheet.state = "hidden";
  return lists.map((list, colIdx) => {
    const colLetter = String.fromCharCode(65 + colIdx); // A, B, C…
    list.forEach((val, rowIdx) => {
      sheet.getCell(rowIdx + 1, colIdx + 1).value = val;
    });
    return `_Lists!$${colLetter}$1:$${colLetter}$${list.length}`;
  });
}

async function blobFromWorkbook(workbook: any): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function getCellText(row: any, col: number): string {
  const cell = row.getCell(col);
  // Unwrap formula result first — formula cells are { formula, result, ... }
  // result itself may be a hyperlink object { text, hyperlink }
  let v: unknown = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "result" in (v as any))
    v = (v as any).result ?? null;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("richText" in obj)
      return ((obj.richText as any[]) ?? []).map((r) => String(r.text ?? "")).join("").trim();
    if ("text" in obj) {
      const t = obj.text;
      // text itself may be a richText object: { richText: [{ text: "..." }] }
      if (t && typeof t === "object" && "richText" in (t as any))
        return ((t as any).richText as any[]).map((r: any) => String(r.text ?? "")).join("").trim();
      return String(t ?? "").trim();
    }
    return "";
  }
  return String(v).trim();
}

// ─── Template generators ──────────────────────────────────────────────────────

export async function downloadClientTemplate(businessTypes?: string[]): Promise<void> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Data");
  const lists = wb.addWorksheet("_Lists");

  const businessTypeList = businessTypes?.length ? businessTypes : BUSINESS_TYPES;

  data.columns = [
    { header: "Client Name *", key: "name", width: 30 },
    { header: "Client File Number", key: "filenum", width: 22 },
    { header: "PAN Number *", key: "pan", width: 16 },
    { header: "Business Type", key: "btype", width: 22 },
    { header: "Date of Incorporation (DD/MM/YYYY)", key: "doi", width: 34 },
    { header: "Address Line 1", key: "a1", width: 30 },
    { header: "Address Line 2", key: "a2", width: 30 },
    { header: "City", key: "city", width: 18 },
    { header: "State", key: "state", width: 26 },
    { header: "PIN Code", key: "pin", width: 12 },
    { header: "Country", key: "country", width: 15 },
    { header: "PAN Login ID", key: "pl", width: 22 },
    { header: "PAN Password", key: "pp", width: 22 },
    { header: "GST Number", key: "gn", width: 18 },
    { header: "GST Login ID", key: "gl", width: 22 },
    { header: "GST Password", key: "gp", width: 22 },
    { header: "TAN Number", key: "tn", width: 16 },
    { header: "TAN Login ID", key: "tl", width: 22 },
    { header: "TAN Password", key: "tp", width: 22 },
    { header: "Aadhaar Number (Individual only)", key: "aadh", width: 28 },
  ];

  styleHeaderRow(data.getRow(1));

  const [btRef, stRef] = buildListsSheet(lists, [businessTypeList, INDIAN_STATES]);
  addDropdownValidation(data, 4, btRef);  // col 4 = Business Type
  addDropdownValidation(data, 9, stRef);  // col 9 = State

  triggerDownload(await blobFromWorkbook(wb), "appealdesk-clients-template.xlsx");
}

export async function downloadTeamUserTemplate(): Promise<void> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Data");
  const lists = wb.addWorksheet("_Lists");

  data.columns = [
    { header: "First Name *", key: "fn", width: 20 },
    { header: "Last Name *", key: "ln", width: 20 },
    { header: "Email *", key: "email", width: 32 },
    { header: "Role *", key: "role", width: 14 },
    { header: "Middle Name", key: "mn", width: 18 },
    { header: "Mobile Number", key: "mob", width: 18 },
    { header: "Mobile Country Code (default +91)", key: "mcc", width: 28 },
    { header: "Date of Birth (DD/MM/YYYY)", key: "dob", width: 26 },
    { header: "Department", key: "dept", width: 20 },
    { header: "Designation", key: "desig", width: 20 },
    { header: "Date of Joining (DD/MM/YYYY)", key: "doj", width: 28 },
    { header: "Date of Leaving (DD/MM/YYYY)", key: "dol", width: 28 },
    { header: "Address Line 1", key: "a1", width: 30 },
    { header: "Address Line 2", key: "a2", width: 30 },
    { header: "City", key: "city", width: 18 },
    { header: "State", key: "state", width: 26 },
    { header: "PIN Code", key: "pin", width: 12 },
    { header: "Country", key: "country", width: 15 },
    { header: "PAN Number", key: "pan", width: 15 },
    { header: "Aadhaar Number", key: "aadh", width: 18 },
  ];

  styleHeaderRow(data.getRow(1));

  const [roleRef, stRef] = buildListsSheet(lists, [ROLES, INDIAN_STATES]);
  addDropdownValidation(data, 4, roleRef);   // col 4 = Role
  addDropdownValidation(data, 16, stRef);    // col 16 = State

  triggerDownload(await blobFromWorkbook(wb), "appealdesk-team-users-template.xlsx");
}

export async function downloadClientUserTemplate(clientOrgs: ClientOrgOption[]): Promise<void> {
  if (clientOrgs.length === 0) {
    throw new Error("No client organisations found. Create at least one client before downloading this template.");
  }
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  const data = wb.addWorksheet("Data");
  const lists = wb.addWorksheet("_Lists");

  data.columns = [
    { header: "First Name *", key: "fn", width: 20 },
    { header: "Last Name *", key: "ln", width: 20 },
    { header: "Email *", key: "email", width: 32 },
    { header: "Client Organisation *", key: "org", width: 36 },
    { header: "Middle Name", key: "mn", width: 18 },
    { header: "Mobile Number", key: "mob", width: 18 },
    { header: "Mobile Country Code (default +91)", key: "mcc", width: 28 },
    { header: "Date of Birth (DD/MM/YYYY)", key: "dob", width: 26 },
  ];

  styleHeaderRow(data.getRow(1));

  const orgNames = clientOrgs.map((o) => o.name);
  const [orgRef] = buildListsSheet(lists, [orgNames]);
  addDropdownValidation(data, 4, orgRef); // col 4 = Client Organisation

  triggerDownload(await blobFromWorkbook(wb), "appealdesk-client-users-template.xlsx");
}

// ─── File parsers ─────────────────────────────────────────────────────────────

async function loadWorkbook(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large. Maximum size is 5 MB.");
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb;
}

function getDataSheet(wb: any) {
  const sheet = wb.getWorksheet("Data");
  if (!sheet) throw new Error("No worksheet named 'Data' found. Upload only the official AppealDesk template.");
  return sheet;
}

export async function parseClientFile(file: File): Promise<ParsedClientRow[]> {
  const wb = await loadWorkbook(file);
  const sheet = getDataSheet(wb);
  const rows: ParsedClientRow[] = [];

  sheet.eachRow((row: any, rowNum: number) => {
    if (rowNum < DATA_START_ROW) return; // skip header row 1
    const name = getCellText(row, 1);
    const pan = getCellText(row, 3);
    if (!name && !pan) return; // skip blank rows

    rows.push({
      rowNumber: rowNum,
      name,
      file_number: getCellText(row, 2) || undefined,
      pan_number: pan,
      business_type: getCellText(row, 4) || undefined,
      date_of_incorporation: getCellText(row, 5) || undefined,
      address_line1: getCellText(row, 6) || undefined,
      address_line2: getCellText(row, 7) || undefined,
      city: getCellText(row, 8) || undefined,
      state: getCellText(row, 9) || undefined,
      pin_code: getCellText(row, 10) || undefined,
      country: getCellText(row, 11) || undefined,
      pan_login_id: getCellText(row, 12) || undefined,
      pan_password: getCellText(row, 13) || undefined,
      gst_number: getCellText(row, 14) || undefined,
      gst_login_id: getCellText(row, 15) || undefined,
      gst_password: getCellText(row, 16) || undefined,
      tan_number: getCellText(row, 17) || undefined,
      tan_login_id: getCellText(row, 18) || undefined,
      tan_password: getCellText(row, 19) || undefined,
      aadhaar_number: getCellText(row, 20) || undefined,
    });
  });

  return rows;
}

export async function parseTeamUserFile(file: File): Promise<ParsedTeamUserRow[]> {
  const wb = await loadWorkbook(file);
  const sheet = getDataSheet(wb);
  const rows: ParsedTeamUserRow[] = [];

  sheet.eachRow((row: any, rowNum: number) => {
    if (rowNum < DATA_START_ROW) return; // skip header row 1
    const first = getCellText(row, 1);
    const email = getCellText(row, 3);
    if (!first && !email) return;

    rows.push({
      rowNumber: rowNum,
      first_name: first,
      last_name: getCellText(row, 2),
      email,
      role: getCellText(row, 4),
      middle_name: getCellText(row, 5) || undefined,
      mobile_number: getCellText(row, 6) || undefined,
      mobile_country_code: getCellText(row, 7) || undefined,
      date_of_birth: getCellText(row, 8) || undefined,
      department: getCellText(row, 9) || undefined,
      designation: getCellText(row, 10) || undefined,
      date_of_joining: getCellText(row, 11) || undefined,
      date_of_leaving: getCellText(row, 12) || undefined,
      address_line1: getCellText(row, 13) || undefined,
      address_line2: getCellText(row, 14) || undefined,
      city: getCellText(row, 15) || undefined,
      state: getCellText(row, 16) || undefined,
      pin_code: getCellText(row, 17) || undefined,
      country: getCellText(row, 18) || undefined,
      pan_number: getCellText(row, 19) || undefined,
      aadhaar_number: getCellText(row, 20) || undefined,
    });
  });

  return rows;
}

export async function parseClientUserFile(file: File): Promise<ParsedClientUserRow[]> {
  const wb = await loadWorkbook(file);
  const sheet = getDataSheet(wb);
  const rows: ParsedClientUserRow[] = [];

  sheet.eachRow((row: any, rowNum: number) => {
    if (rowNum < DATA_START_ROW) return; // skip header row 1
    const first = getCellText(row, 1);
    const email = getCellText(row, 3);
    if (!first && !email) return;

    rows.push({
      rowNumber: rowNum,
      first_name: first,
      last_name: getCellText(row, 2),
      email,
      client_org_name: getCellText(row, 4),
      middle_name: getCellText(row, 5) || undefined,
      mobile_number: getCellText(row, 6) || undefined,
      mobile_country_code: getCellText(row, 7) || undefined,
      date_of_birth: getCellText(row, 8) || undefined,
    });
  });

  return rows;
}
