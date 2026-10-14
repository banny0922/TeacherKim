// 엑셀(.xlsx) 또는 CSV 파일을 읽어서 문자열 2차원 배열로 돌려준다 (학급명렬·성적 올리기에서 공통으로 사용)
const clean = (rows) => rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim())));

// 모든 시트: [{ sheet: '시트 이름', rows: [[...], ...] }]. CSV는 파일 이름을 시트 이름으로 하는 한 개 시트.
export async function readSheets(file) {
  if (/\.csv$/i.test(file.name)) {
    const txt = (await file.text()).replace(/^﻿/, '');
    const rows = txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
    return [{ sheet: file.name.replace(/\.csv$/i, ''), rows: clean(rows) }];
  }
  const { default: readXlsx } = await import('read-excel-file/browser');
  const sheets = await readXlsx(file);
  return sheets.map((s) => ({ sheet: s.sheet, rows: clean(s.data) }));
}

// 첫 시트만 (학급명렬용)
export async function readTable(file) {
  return (await readSheets(file))[0]?.rows ?? [];
}
