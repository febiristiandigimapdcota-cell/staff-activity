import * as XLSX from 'xlsx';
import { StaffMember, PhotoRecord } from '../types';
import { DAYS_ID } from '../data/defaultData';

/**
 * Parses an Excel or CSV file into StaffMember array.
 * Expected columns:
 * Col 0: Nama Staff
 * Col 1: Role / Posisi
 * Col 2..8: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu
 */
export async function parseExcelFile(file: File): Promise<StaffMember[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

  return parseRowsToStaff(rawData);
}

/**
 * Parses raw CSV string (e.g. from Google Sheets export) into StaffMember array.
 */
export function parseCsvString(csvText: string): StaffMember[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const rawRows: string[][] = lines.map(line => {
    // Basic CSV splitting with quote handling
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (matches) {
      return matches.map(cell => cell.replace(/^"|"$/g, '').trim());
    }
    return line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
  });

  return parseRowsToStaff(rawRows);
}

function parseRowsToStaff(rows: (string | number)[][]): StaffMember[] {
  if (rows.length <= 1) return [];

  const staffList: StaffMember[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const name = String(row[0]).trim();
    if (!name) continue;

    const role = row[1] ? String(row[1]).trim() : 'Staff';
    const shifts: string[] = [];

    // Columns 2 to 8 represent Senin..Minggu
    for (let day = 0; day < 7; day++) {
      const shiftVal = row[day + 2];
      shifts.push(shiftVal ? String(shiftVal).trim().toUpperCase() : 'OFF');
    }

    staffList.push({
      id: i,
      name,
      role,
      shifts,
      targetOps: 0,
      achOps: 0,
      achTryOn: 0,
      achWeeklySeed: 0,
      achChecklist: 0
    });
  }

  return staffList;
}

/**
 * Downloads a pre-formatted CSV template for weekly schedule upload.
 */
export function downloadCsvTemplate(): void {
  const templateCsv =
    'Nama Staff,Role,Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu\n' +
    'Nama Staf 1,Staff,P,P/TRP,MD11,P,S,OFF,OFF\n' +
    'Nama Staf 2,Staff,S,S,P,MD12/TRS,P,OFF,OFF\n' +
    'Nama Staf 3,Staff,MD13,P,S,S,OFF/TRP,P,MD11\n' +
    'Nama Leader,Store Leader,P,P,OFF,P,P,P,S\n' +
    'Nama Kasir,Cashier,S,OFF,S,P,MD13,P,S';

  const blob = new Blob([templateCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Template_Schedule_Mingguan_Toko.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports current store data & achievement recap to a clean, multi-sheet Excel (.xlsx) file.
 */
export function exportWeeklyRecapToExcel(staffList: StaffMember[], photos: PhotoRecord[]): void {
  const recapData = staffList.map(s => {
    const opsPct = s.targetOps > 0 ? `${Math.round((s.achOps / s.targetOps) * 100)}%` : '0%';
    const totalPhotos = photos.filter(p => p.staffName === s.name).length;

    return {
      'ID Staff': `#00${s.id}`,
      'Nama Staff': s.name,
      'Posisi / Role': s.role || 'Specialist',
      'Senin': s.shifts[0] || 'OFF',
      'Selasa': s.shifts[1] || 'OFF',
      'Rabu': s.shifts[2] || 'OFF',
      'Kamis': s.shifts[3] || 'OFF',
      'Jumat': s.shifts[4] || 'OFF',
      'Sabtu': s.shifts[5] || 'OFF',
      'Minggu': s.shifts[6] || 'OFF',
      'Target OPS': s.targetOps,
      'Selesai OPS': s.achOps,
      'Persen OPS': opsPct,
      'Target Try-On': s.targetTryOn || 0,
      'Selesai Try-On (Cust)': s.achTryOn,
      'Weekly Seed': s.achWeeklySeed || 0,
      'Daily Checklist': s.achChecklist || 0,
      'Total Foto Bukti': totalPhotos
    };
  });

  const photoLogData = photos.map(p => ({
    'ID Bukti': p.id,
    'Timestamp': p.timestamp,
    'Nama Staff': p.staffName,
    'Kategori Aktivitas': p.activityType,
    'Catatan': p.note,
    'Status Drive': p.syncedToDrive ? 'Tersimpan / Synced' : 'Dashboard Only'
  }));

  const wb = XLSX.utils.book_new();
  const wsRecap = XLSX.utils.json_to_sheet(recapData);
  const wsPhotos = XLSX.utils.json_to_sheet(photoLogData.length > 0 ? photoLogData : [{ Info: 'Belum ada bukti foto diunggah' }]);

  XLSX.utils.book_append_sheet(wb, wsRecap, 'Rekapitulasi Mingguan');
  XLSX.utils.book_append_sheet(wb, wsPhotos, 'Log Bukti Screenshot');

  const todayStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Rekap_Operasional_Toko_${todayStr}.xlsx`);
}

/**
 * Export complete application state to JSON file for offline backup.
 */
export function exportBackupJson(data: { staff: StaffMember[]; photos: PhotoRecord[]; config: unknown }): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ActivityOS_Backup_${Date.now()}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
