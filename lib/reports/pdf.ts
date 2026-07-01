/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { LitigationReportData } from "@/app/(sp)/litigations/actions";
import { buildHierarchy, catLabel, cap, fmtDate } from "./hierarchy";
import { BRAND, hexToRgb } from "@/lib/theme";

const NAVY      = hexToRgb(BRAND.primary);
const MID_BLUE  = hexToRgb(BRAND.accent);
const LIGHT_HDR = hexToRgb(BRAND.tableHeader);
const GRAY_TXT  = hexToRgb(BRAND.secondary);
const DARK_TXT  = hexToRgb(BRAND.heading);

function footer(doc: jsPDF, pageW: number, pageH: number, generatedAt: string, spName: string) {
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `${spName} — Litigation Report — ${fmtDate(generatedAt)}`,
    14,
    pageH - 6,
  );
  const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
  doc.text(`Page ${pg}`, pageW - 14, pageH - 6, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

export function generatePDF(data: LitigationReportData): Blob {
  const doc  = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const open       = data.appeals.filter((a) => a.status === "open").length;
  const inProgress = data.appeals.filter((a) => a.status === "in-progress").length;
  const closed     = data.appeals.filter((a) => a.status === "closed").length;

  const common = {
    margin: { left: 14, right: 14 },
    didDrawPage: () => footer(doc, pageW, pageH, data.generatedAt, data.spName),
  };

  // ── Cover stats ───────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`${data.spName} — Litigation Report`, 14, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_TXT);
  doc.text(`Generated: ${fmtDate(data.generatedAt)}`, 14, 22);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    ...common,
    startY: 27,
    head: [["Total Litigations", "Open", "In-Progress", "Closed"]],
    body:  [[data.appeals.length, open, inProgress, closed]],
    theme: "grid",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: "bold", halign: "center" },
    bodyStyles: { fontSize: 11, halign: "center", fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } },
    tableWidth: 170,
  });

  let y = (doc as any).lastAutoTable.finalY + 10;

  // ── Hierarchical sections ─────────────────────────────────────────
  for (const litNode of buildHierarchy(data)) {
    const { appeal } = litNode;

    // Check if we're too close to the bottom — add a new page
    if (y > pageH - 30) {
      doc.addPage();
      y = 14;
    }

    // Litigation header band
    autoTable(doc, {
      ...common,
      startY: y,
      head: [[
        `${appeal.client_name}   —   ${appeal.act_name}`,
        `FY: ${appeal.financial_year || "—"}  /  AY: ${appeal.assessment_year || "—"}`,
        cap(appeal.status),
      ]],
      body: [],
      theme: "plain",
      headStyles: {
        fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: "bold",
        cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
      },
      columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 60 }, 2: { cellWidth: 28 } },
    });
    y = (doc as any).lastAutoTable.finalY;

    for (const procNode of litNode.proceedings) {
      const p = procNode.proceeding;
      const procHeader = [
        p.proceeding_type || "Proceeding",
        [cap(p.authority_type), p.authority_name].filter(Boolean).join(" — "),
        [p.jurisdiction, p.jurisdiction_city].filter(Boolean).join(", "),
        cap(p.importance),
        cap(p.status),
      ].filter(Boolean).join("   |   ");

      // Proceeding sub-header
      autoTable(doc, {
        ...common,
        startY: y,
        head: [[procHeader]],
        body: [],
        theme: "plain",
        headStyles: {
          fillColor: MID_BLUE, textColor: 255, fontSize: 8, fontStyle: "bold",
          cellPadding: { top: 2, bottom: 2, left: 14, right: 6 },
        },
      });
      y = (doc as any).lastAutoTable.finalY;

      // Proceeding documents
      if (procNode.documents.length > 0) {
        const docRows = procNode.documents.map((d) => [
          `📎  ${d.file_name}`, d.description,
        ]);
        autoTable(doc, {
          ...common,
          startY: y,
          body: docRows,
          theme: "plain",
          bodyStyles: { fontSize: 7, textColor: [80, 80, 80], cellPadding: { top: 1, bottom: 1, left: 22, right: 6 } },
          columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: "auto" } },
        });
        y = (doc as any).lastAutoTable.finalY;
      }

      // Events table
      if (procNode.mainEvents.length > 0) {
        const eventRows: string[][] = [];

        for (const evtNode of procNode.mainEvents) {
          const e = evtNode.event;
          eventRows.push([
            "Main Event",
            catLabel(e.category),
            fmtDate(e.event_date),
            e.event_notice_number || "",
            cap(e.status),
            e.description || "",
          ]);

          for (const doc of evtNode.documents) {
            eventRows.push([
              "Attachment",
              `📎  ${doc.file_name}`,
              "", "", "",
              doc.description || "",
            ]);
          }

          for (const subNode of evtNode.subEvents) {
            const s = subNode.event;
            eventRows.push([
              "↳ Sub Event",
              catLabel(s.category),
              fmtDate(s.event_date),
              s.event_notice_number || "",
              cap(s.status),
              s.description || "",
            ]);

            for (const doc of subNode.documents) {
              eventRows.push([
                "  Attachment",
                `📎  ${doc.file_name}`,
                "", "", "",
                doc.description || "",
              ]);
            }
          }
        }

        autoTable(doc, {
          ...common,
          startY: y,
          head: [["Type", "Category / File", "Date", "Notice #", "Status", "Description"]],
          body: eventRows,
          theme: "striped",
          headStyles: { fillColor: LIGHT_HDR, textColor: DARK_TXT, fontSize: 7, fontStyle: "bold" },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [247, 249, 252] },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 52 },
            2: { cellWidth: 20 },
            3: { cellWidth: 24 },
            4: { cellWidth: 18 },
            5: { cellWidth: "auto" },
          },
          margin: { left: 20, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 3;
      } else {
        y += 1;
      }
    }

    y += 6;
  }

  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}
