import ExcelJS from "exceljs";
import { MarkdownTable } from "../utils/markdown";

export interface ExcelWorkbookResult {
  buffer: ArrayBuffer;
  filename: string;
  isUsecase: boolean;
  isUat: boolean;
}

/**
 * Sinh file Excel UAT hoặc Use Case chuyên nghiệp từ các bảng Markdown
 */
export async function generateExcelFromTables(
  tables: MarkdownTable[],
  query: string
): Promise<ExcelWorkbookResult> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MVL Assistant Slackbot";
  wb.lastModifiedBy = "MVL AI Squad";
  wb.created = new Date();
  wb.modified = new Date();

  let isUsecase = false;
  let isUat = false;

  for (const table of tables) {
    const headers = table.headers;
    const rows = table.rows;

    // 1. Kiểm tra nếu là bảng Kịch bản UAT (5 cột)
    if (
      headers.length === 5 &&
      headers.some((h) => h.includes("Sub Module") || h.includes("Mô tả") || h.includes("Bước thực hiện"))
    ) {
      isUat = true;
      const ws = wb.addWorksheet("Kịch bản UAT", {
        views: [{ showGridLines: true }],
      });

      const uatHeaders = [
        "Sub Module",
        "ID",
        "Mô tả",
        "Bước thực hiện",
        "Dữ liệu test",
        "Kết quả mong đợi",
        "Trạng thái (web)",
        "Kết quả thực tế",
        "Ghi chú",
      ];

      // Header row
      const headerRow = ws.addRow(uatHeaders);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F497D" }, // Deep Navy
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Data rows
      let prevGroup = "";
      rows.forEach((r, idx) => {
        const rowNumber = idx + 2;
        const subModule = r[0] || "";
        const mota = r[1] || "";
        const steps = r[2] || "";
        const expected = r[3] || "";
        const testData = r[4] || "";

        const isGroupChange = subModule.trim() !== prevGroup;
        const groupVal = isGroupChange ? subModule.trim() : "";
        if (isGroupChange) prevGroup = subModule.trim();

        const dataRow = ws.addRow([
          groupVal,
          { formula: `IF(G${rowNumber}="","",COUNTA($G$2:G${rowNumber}))` },
          mota.replace(/<br\s*\/?>/gi, "\n"),
          steps.replace(/<br\s*\/?>/gi, "\n"),
          testData.replace(/<br\s*\/?>/gi, "\n"),
          expected.replace(/<br\s*\/?>/gi, "\n"),
          "Pass",
          "",
          "",
        ]);

        dataRow.eachCell((cell, colNumber) => {
          cell.font = { name: "Arial", size: 9 };
          cell.border = {
            top: { style: "thin", color: { argb: "FFD3D3D3" } },
            left: { style: "thin", color: { argb: "FFD3D3D3" } },
            bottom: { style: "thin", color: { argb: "FFD3D3D3" } },
            right: { style: "thin", color: { argb: "FFD3D3D3" } },
          };

          if (colNumber === 1 && isGroupChange) {
            cell.font = { name: "Arial", size: 9, bold: true };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF2F2F2" },
            };
          }

          if ([1, 2, 7, 8].includes(colNumber)) {
            cell.alignment = { vertical: "top", horizontal: "center", wrapText: true };
          } else {
            cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
          }
        });
      });

      // Column widths
      ws.getColumn(1).width = 24; // Sub Module
      ws.getColumn(2).width = 8;  // ID
      ws.getColumn(3).width = 32; // Mô tả
      ws.getColumn(4).width = 40; // Bước thực hiện
      ws.getColumn(5).width = 25; // Dữ liệu test
      ws.getColumn(6).width = 40; // Kết quả mong đợi
      ws.getColumn(7).width = 15; // Trạng thái
      ws.getColumn(8).width = 15; // Kết quả thực tế
      ws.getColumn(9).width = 20; // Ghi chú
    }

    // 2. Kiểm tra nếu là bảng Tổng quan UC (6 cột)
    else if (headers.length === 6) {
      isUsecase = true;
      const ws = wb.addWorksheet("Tổng quan UC", {
        views: [{ showGridLines: true }],
      });

      const headerRow = ws.addRow(headers);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF002060" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      rows.forEach((r) => {
        const row = ws.addRow(r.map((val) => val.replace(/<br\s*\/?>/gi, "\n")));
        row.eachCell((cell) => {
          cell.font = { name: "Arial", size: 9 };
          cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        });
      });

      ws.columns.forEach((col) => {
        col.width = 25;
      });
    }

    // 3. Kiểm tra nếu là bảng Chi tiết UC (10 cột)
    else if (headers.length === 10) {
      isUsecase = true;
      const ws = wb.addWorksheet("Chi tiết UC", {
        views: [{ showGridLines: true }],
      });

      const headerRow = ws.addRow(headers);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF002060" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });

      rows.forEach((r) => {
        const row = ws.addRow(r.map((val) => val.replace(/<br\s*\/?>/gi, "\n")));
        row.eachCell((cell) => {
          cell.font = { name: "Arial", size: 9 };
          cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
        });
      });

      ws.columns.forEach((col) => {
        col.width = 28;
      });
    }
  }

  // Nếu không match bảng đặc biệt, xuất sheet dữ liệu chung
  if (!isUat && !isUsecase && tables.length > 0) {
    const table = tables[0];
    const ws = wb.addWorksheet("Dữ liệu", { views: [{ showGridLines: true }] });
    ws.addRow(table.headers);
    table.rows.forEach((r) => ws.addRow(r));
  }

  const rawBuffer: any = await wb.xlsx.writeBuffer();
  // Ensure we have a standard ArrayBuffer (Node Buffer may have byteOffset/byteLength)
  const arrayBuffer: ArrayBuffer = rawBuffer.buffer
    ? rawBuffer.buffer.slice(
        rawBuffer.byteOffset || 0,
        (rawBuffer.byteOffset || 0) + (rawBuffer.byteLength || rawBuffer.length)
      )
    : (new Uint8Array(rawBuffer).buffer as ArrayBuffer);

  let filename = "Kich_ban_UAT.xlsx";
  if (isUsecase) {
    filename = "Danh_sach_UseCase.xlsx";
  }

  return {
    buffer: arrayBuffer,
    filename,
    isUsecase,
    isUat,
  };
}
