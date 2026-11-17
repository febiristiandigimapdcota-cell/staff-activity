import React from 'react';
import { X, Printer, Users, Video, CheckSquare } from 'lucide-react';
import { StaffMember } from '../../types';
import { DAYS_ID } from '../../data/defaultData';
import { getDailyOpsSessions, getDailyTryOnSessions, isShiftOff } from '../../utils/scheduler';
import { TryOnDevicesIcon } from '../common/TryOnDevicesIcon';

interface DailyBriefPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  dayIndex: number;
}

export const DailyBriefPrintModal: React.FC<DailyBriefPrintModalProps> = ({
  isOpen,
  onClose,
  staffList,
  dayIndex
}) => {
  if (!isOpen) return null;

  const dayName = DAYS_ID[dayIndex];
  const todayDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const onDutyStaff = staffList.filter(s => !isShiftOff(s.shifts[dayIndex]));
  const offStaff = staffList.filter(s => isShiftOff(s.shifts[dayIndex]));
  const opsSessions = getDailyOpsSessions(staffList, dayIndex);
  const tryOnSessions = getDailyTryOnSessions(staffList, dayIndex);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="liquid-glass-modal rounded-[28px] max-w-2xl w-full my-8 p-6 print:p-0 print:border-none print:shadow-none animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Controls (Hidden in Print) */}
        <div className="flex justify-between items-center pb-4 border-b border-zinc-200 mb-6 no-print">
          <h3 className="font-bold text-zinc-900 text-sm">Printable Daily Operational Brief</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-medium transition shadow-sm flex items-center space-x-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Print Laporan</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet Content */}
        <div className="text-zinc-900 space-y-6 print:space-y-4">
          {/* Header */}
          <div className="border-b-2 border-zinc-900 pb-4 flex justify-between items-start">
            <div className="flex items-start space-x-3">
              <img
                src="/app-logo.png"
                alt="Logo"
                className="w-10 h-10 rounded-xl object-cover border border-zinc-300 shrink-0"
              />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                    STAFF ACTIVITY
                  </span>
                  <span className="text-xs font-semibold text-zinc-600">Store Operations</span>
                  <span className="text-[10px] text-zinc-400">· Developer: Febiristian 2026</span>
                </div>
                <h1 className="text-xl font-extrabold tracking-tight mt-1 text-zinc-900">
                  DAILY OPERATIONAL BRIEF & ROSTER
                </h1>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-zinc-100 rounded-lg text-xs font-bold text-zinc-900">
                {dayName.toUpperCase()}
              </span>
              <p className="text-[11px] text-zinc-500 mt-1 font-mono">{todayDate}</p>
            </div>
          </div>

          {/* Section 1: Staff On-Duty */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center mb-2">
              <Users className="w-3.5 h-3.5 mr-1.5 text-zinc-600" />
              1. Personil Bertugas Hari Ini ({onDutyStaff.length} On-Duty)
            </h2>
            {onDutyStaff.length === 0 ? (
              <p className="text-xs text-zinc-400 italic p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                Belum ada staf yang terjadwal hari ini. Unggah jadwal toko di Area Admin.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {onDutyStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-2 rounded-lg border border-zinc-200 bg-zinc-50/60 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-zinc-900 truncate">{staff.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 text-white">
                      Shift {staff.shifts[dayIndex]}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {offStaff.length > 0 && onDutyStaff.length > 0 && (
              <p className="text-[11px] text-zinc-400 mt-1.5">
                Libur / OFF: {offStaff.map(s => s.name).join(', ')}
              </p>
            )}
          </div>

          {/* Section 2: Open Studio (OPS) Sessions */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center mb-2">
              <Video className="w-3.5 h-3.5 mr-1.5 text-zinc-600" />
              2. Alokasi Host Open Studio (Target 3 Sesi/Hari)
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {opsSessions.map((session, idx) => (
                <div key={idx} className="p-3 border border-zinc-200 rounded-xl bg-zinc-50">
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 mb-1">
                    <span>{session.title.split(' ')[0]} {session.title.split(' ')[1]}</span>
                    <span>{session.time}</span>
                  </div>
                  <h4 className="font-bold text-xs text-zinc-900 truncate">{session.host}</h4>
                  <div className="mt-1 text-[10px] text-zinc-500 flex justify-between">
                    <span>Status:</span>
                    <span className="font-medium text-zinc-800">{session.shift}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: 6 Try-On iPad Slots */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center mb-2">
              <TryOnDevicesIcon className="w-5 h-3.5 mr-1.5 text-zinc-700" />
              3. Alokasi 6 Sesi Try-On Customer Toko
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tryOnSessions.map((slot) => (
                <div key={slot.id} className="p-2.5 border border-zinc-200 rounded-lg text-xs bg-zinc-50">
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono mb-0.5">
                    <span className="font-semibold text-zinc-700">{slot.title}</span>
                    <span>{slot.time}</span>
                  </div>
                  <p className="font-bold text-zinc-900 truncate">
                    {slot.assignedStaff ? slot.assignedStaff.name : 'Tidak Ada Host'}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    Shift {slot.assignedStaff?.shifts[dayIndex] || '-'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Operational Target & Signatures */}
          <div className="border-t border-zinc-200 pt-4 grid grid-cols-2 gap-6">
            <div className="text-[11px] text-zinc-600 space-y-1">
              <p className="font-bold text-zinc-800 flex items-center">
                <CheckSquare className="w-3.5 h-3.5 mr-1 text-zinc-700" /> Checklist Harian:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-zinc-500">
                <li>Briefing Pagi & Ceklist Operasional (M131)</li>
                <li>Dokumentasi & Upload Bukti Screenshot per sesi</li>
                <li>Pencatatan data Try-On pelanggan ke Form Aksara</li>
                <li>Handover closing shift & stock count</li>
              </ul>
            </div>

            <div className="flex justify-between text-center pt-2">
              <div className="space-y-8">
                <p className="text-[10px] text-zinc-500">Disiapkan Oleh (Store Leader):</p>
                <div className="border-b border-zinc-400 w-28 mx-auto"></div>
              </div>
              <div className="space-y-8">
                <p className="text-[10px] text-zinc-500">Diverifikasi Oleh (Manager):</p>
                <div className="border-b border-zinc-400 w-28 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
