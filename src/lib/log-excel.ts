import ExcelJS from "exceljs";

export type ExcelLogRow = {
  log_date: string; // YYYY-MM-DD
  activity: string;
  minutes: number;
  proof: string | null;
  period: string; // mis. "Okt 2026"
  is_correction: boolean;
};

// Menyusun file Excel log kerja: judul, keterangan rentang, tabel, dan baris total.
export async function buildLogWorkbook(opts: {
  title: string;
  rangeLabel: string;
  rows: ExcelLogRow[];
}): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Crustea Portal";
  const sheet = workbook.addWorksheet("Log Kerja");

  sheet.addRow([opts.title]).font = { bold: true, size: 13 };
  sheet.addRow([opts.rangeLabel]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Tanggal", "Aktivitas", "Menit", "Jam", "Bukti", "Periode", "Koreksi"]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  });
  const firstDataRow = headerRow.number + 1;

  for (const log of opts.rows) {
    const row = sheet.addRow([
      new Date(`${log.log_date}T00:00:00Z`),
      log.activity,
      log.minutes,
      null,
      log.proof ?? "",
      log.period,
      log.is_correction ? "Ya" : "",
    ]);
    row.getCell(4).value = { formula: `C${row.number}/60`, result: log.minutes / 60 };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  const lastDataRow = firstDataRow + opts.rows.length - 1;
  const totalMinutes = opts.rows.reduce((t, l) => t + l.minutes, 0);
  const hasRows = opts.rows.length > 0;
  const totalRow = sheet.addRow([
    "Total",
    `${opts.rows.length} catatan`,
    hasRows ? { formula: `SUM(C${firstDataRow}:C${lastDataRow})`, result: totalMinutes } : 0,
    hasRows ? { formula: `SUM(D${firstDataRow}:D${lastDataRow})`, result: totalMinutes / 60 } : 0,
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
  });

  sheet.getColumn(1).numFmt = "dd mmm yyyy";
  sheet.getColumn(3).numFmt = "#,##0";
  sheet.getColumn(4).numFmt = "#,##0.00";
  [14, 60, 9, 9, 40, 12, 9].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
