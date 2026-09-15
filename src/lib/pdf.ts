// src/lib/pdf.ts — PDF export (jspdf + html2canvas)
// This file is ONLY imported dynamically so it never enters the initial bundle.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import type { QueryResult } from "@/lib/api";

export async function downloadPDF(result: QueryResult) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageW = 210, pageH = 297, margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Header Banner - QiDesk Deep Blue
  doc.setFillColor(11, 36, 99);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("SQL Analyst Report", margin, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 21);
  doc.setTextColor(15, 23, 42); // Slate 900
  y = 38;

  if (result.question) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text("QUESTION", margin, y);
    y += 4;
    doc.setFontSize(11);
    doc.setTextColor(11, 36, 99); // Deep Blue
    doc.setFont("helvetica", "bold");
    const qLines = doc.splitTextToSize(result.question, contentW);
    doc.text(qLines, margin, y);
    y += qLines.length * 6 + 6;
    doc.setFont("helvetica", "normal");
  }

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("DATA RESULTS", margin, y);
  y += 4;
  
  // Table Styling
  autoTable(doc, {
    startY: y,
    head: [result.columns],
    body: result.rows.slice(0, 100).map((r) => (r as unknown[]).map((v) => String(v ?? ""))),
    styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
    headStyles: {
      fillColor: [11, 36, 99], // Deep Blue Header
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // Slate 50
    margin: { left: margin, right: margin },
    tableWidth: contentW,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (result.sql_query) {
    if (y > pageH - 50) { doc.addPage(); y = margin; }
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text("SQL QUERY", margin, y);
    y += 4;
    const sqlLines = doc.splitTextToSize(result.sql_query, contentW - 8);
    const sqlH = Math.min(sqlLines.length * 5 + 8, 80);
    doc.setFillColor(11, 36, 99); // Deep Blue Background
    doc.roundedRect(margin, y, contentW, sqlH, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(241, 245, 249); // Slate 100
    doc.setFont("courier", "normal");
    doc.text(sqlLines.slice(0, 14), margin + 4, y + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    y += sqlH + 10;
  }

  const chartsEl = document.getElementById("charts-section");
  if (chartsEl) {
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("CHARTS", margin, y);
    y += 4;
    try {
      const canvas = await html2canvas(chartsEl, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const ratio = canvas.width / canvas.height;
      const imgW = contentW, imgH = imgW / ratio;
      if (y + imgH > pageH - margin) { doc.addPage(); y = margin; }
      doc.addImage(img, "PNG", margin, y, imgW, Math.min(imgH, pageH - y - margin));
      y += Math.min(imgH, pageH - y - margin) + 8;
    } catch (e) {
      console.error("Chart capture failed:", e);
    }
  }

  if (result.analysis) {
    doc.addPage();
    y = margin;
    doc.setFillColor(11, 36, 99);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("AI Insights", margin, 14);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    y = 30;

    const cleaned = result.analysis
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`]*`/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .trim();

    const smatch = cleaned.match(/SUMMARY:\s*(.+?)(?=\n\n|KEY FINDINGS|$)/si);
    const fmatch = cleaned.match(/KEY FINDINGS:\s*([\s\S]+?)(?=\n\nOPPORTUNITIES|\n\nRISK FLAGS|$)/si);
    const omatch = cleaned.match(/OPPORTUNITIES:\s*([\s\S]+?)(?=\n\nRISK FLAGS|$)/si);
    const rmatch = cleaned.match(/RISK FLAGS:\s*([\s\S]+?)$/si);

    type Sec = { label: string; color: [number, number, number]; bg: [number, number, number]; content: string; };
    const secs: Sec[] = [];
    if (smatch) secs.push({ label: "Summary", color: [11, 36, 99], bg: [241, 245, 249], content: smatch[1].trim() });
    if (fmatch) secs.push({ label: "Key Findings", color: [11, 36, 99], bg: [241, 245, 249], content: fmatch[1].trim() });
    if (omatch) secs.push({ label: "Opportunities", color: [22, 163, 74], bg: [240, 253, 244], content: omatch[1].trim() });
    if (rmatch) secs.push({ label: "Risk Flags", color: [220, 38, 38], bg: [254, 242, 242], content: rmatch[1].trim() });

    for (const sec of secs) {
      if (y > pageH - 40) { doc.addPage(); y = margin; }
      doc.setFontSize(9);
      doc.setTextColor(...sec.color);
      doc.setFont("helvetica", "bold");
      doc.text(sec.label.toUpperCase(), margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(sec.content, contentW - 8);
      const bh = lines.length * 5 + 8;
      doc.setFillColor(...sec.bg);
      doc.roundedRect(margin, y, contentW, bh, 2, 2, "F");
      doc.setFontSize(9);
      doc.setTextColor(...sec.color);
      doc.text(lines, margin + 4, y + 6);
      doc.setTextColor(15, 23, 42);
      y += bh + 8;
    }

    if (secs.length === 0) {
      const lines = doc.splitTextToSize(cleaned, contentW);
      doc.setFontSize(10);
      doc.text(lines, margin, y);
    }
  }

  const total = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`SQL Analyst | QiDesk by QuinteFT · Page ${i} of ${total}`, pageW / 2, pageH - 6, { align: "center" });
  }
  doc.save(`QiDesk_Report_${Date.now()}.pdf`);
}