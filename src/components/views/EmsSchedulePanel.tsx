import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarClock,
  RefreshCw,
  Copy,
  Check,
  Download,
  Sparkles,
  Sun,
  Sunset,
  Laptop,
  Watch,
  Headphones,
  HelpCircle,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  StaffMember,
  EmsScheduleData,
  EmsTopic,
  EMS_TOPICS
} from '../../types';
import {
  generateEmsWeeklySchedule,
  computeEmsFairnessMetrics,
  getShiftBadgeStyle,
  isStaffRole,
  isShiftOff,
  isEmsScheduleValidForStaffOnly
} from '../../utils/scheduler';

interface EmsSchedulePanelProps {
  staffList: StaffMember[];
  emsSchedule: EmsScheduleData | null;
  onSaveEmsSchedule: (ems: EmsScheduleData) => Promise<void>;
}

const getTopicBadgeMeta = (topic: EmsTopic) => {
  switch (topic) {
    case 'Demo Mac':
      return {
        icon: <Laptop className="w-3.5 h-3.5 text-blue-600" />,
        bg: 'bg-blue-50/90 text-blue-800 border-blue-200/80'
      };
    case 'Demo Apple Watch':
      return {
        icon: <Watch className="w-3.5 h-3.5 text-rose-600" />,
        bg: 'bg-rose-50/90 text-rose-800 border-rose-200/80'
      };
    case 'Demo Accessories':
      return {
        icon: <Headphones className="w-3.5 h-3.5 text-purple-600" />,
        bg: 'bg-purple-50/90 text-purple-800 border-purple-200/80'
      };
    case 'Question Exercise':
      return {
        icon: <HelpCircle className="w-3.5 h-3.5 text-amber-600" />,
        bg: 'bg-amber-50/90 text-amber-800 border-amber-200/80'
      };
  }
};

export const EmsSchedulePanel: React.FC<EmsSchedulePanelProps> = ({
  staffList,
  emsSchedule,
  onSaveEmsSchedule
}) => {
  const [seedCounter, setSeedCounter] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const eligibleStaffList = useMemo(
    () => staffList.filter((s) => isStaffRole(s.role)),
    [staffList]
  );

  // Derive active schedule: use persisted emsSchedule if valid & Staff-only, otherwise auto-generate fairly
  const activeSchedule: EmsScheduleData = useMemo(() => {
    if (isEmsScheduleValidForStaffOnly(emsSchedule, staffList)) {
      return emsSchedule as EmsScheduleData;
    }
    return generateEmsWeeklySchedule(staffList, 0);
  }, [emsSchedule, staffList]);

  // Auto-persist Staff-only generated EMS schedule to Firestore if none exists or legacy non-Staff slots detected
  useEffect(() => {
    if (eligibleStaffList.length > 0 && !isEmsScheduleValidForStaffOnly(emsSchedule, staffList)) {
      const generated = generateEmsWeeklySchedule(staffList, 0);
      onSaveEmsSchedule(generated).catch(() => {});
    }
  }, [staffList, eligibleStaffList.length, emsSchedule, onSaveEmsSchedule]);

  // Fairness metrics across 7 days
  const fairnessMetrics = useMemo(
    () => computeEmsFairnessMetrics(activeSchedule, staffList),
    [activeSchedule, staffList]
  );

  // Topic balance counter across the week
  const topicCounts = useMemo(() => {
    const counts: Record<EmsTopic, number> = {
      'Demo Mac': 0,
      'Demo Apple Watch': 0,
      'Demo Accessories': 0,
      'Question Exercise': 0
    };
    activeSchedule.days.forEach((d) => {
      if (d.morningSlot?.topic) counts[d.morningSlot.topic] = (counts[d.morningSlot.topic] || 0) + 1;
      if (d.afternoonSlot?.topic) counts[d.afternoonSlot.topic] = (counts[d.afternoonSlot.topic] || 0) + 1;
    });
    return counts;
  }, [activeSchedule]);

  const handleRegenerateFair = async () => {
    if (staffList.length === 0) return;
    const nextSeed = seedCounter + 1;
    setSeedCounter(nextSeed);
    const fresh = generateEmsWeeklySchedule(staffList, nextSeed);
    setIsSaving(true);
    try {
      await onSaveEmsSchedule(fresh);
      setSaveMessage('EMS Schedule berhasil di-generate merata & tersinkronisasi ke Cloud!');
      setTimeout(() => setSaveMessage(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSlot = async (
    dayIndex: number,
    slotKey: 'morningSlot' | 'afternoonSlot',
    updates: { staffName?: string; topic?: EmsTopic }
  ) => {
    const updatedDays = activeSchedule.days.map((day) => {
      if (day.dayIndex !== dayIndex) return day;
      const currentSlot = day[slotKey];
      if (!currentSlot) return day;

      let nextStaffId = currentSlot.staffId;
      let nextStaffName = currentSlot.staffName;
      let nextShift = currentSlot.shift;

      if (updates.staffName) {
        const found = staffList.find((s) => s.name === updates.staffName);
        if (found) {
          nextStaffId = found.id;
          nextStaffName = found.name;
          nextShift = found.shifts[dayIndex] || currentSlot.shift;
        }
      }

      return {
        ...day,
        [slotKey]: {
          ...currentSlot,
          staffId: nextStaffId,
          staffName: nextStaffName,
          shift: nextShift,
          topic: updates.topic || currentSlot.topic,
          isFallback: false
        }
      };
    });

    const updatedSchedule: EmsScheduleData = {
      ...activeSchedule,
      days: updatedDays,
      updatedAt: new Date().toISOString(),
      isCustomized: true
    };

    setIsSaving(true);
    try {
      await onSaveEmsSchedule(updatedSchedule);
      setSaveMessage(`Perubahan EMS hari ${activeSchedule.days[dayIndex]?.dayName} tersimpan ke Cloud.`);
      setTimeout(() => setSaveMessage(null), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWhatsApp = () => {
    const lines: string[] = [
      '📋 *EMS SCHEDULE MINGGUAN TOKO*',
      '_(2 Staff / Hari: 1 Shift Pagi & 1 Shift Siang/Middle)_',
      ''
    ];
    activeSchedule.days.forEach((d) => {
      lines.push(`📅 *${d.dayName.toUpperCase()}*`);
      if (d.morningSlot) {
        lines.push(
          `  ☀️ Pagi (${d.morningSlot.shift}): *${d.morningSlot.staffName}* — Topic: _${d.morningSlot.topic}_`
        );
      } else {
        lines.push('  ☀️ Pagi: -');
      }
      if (d.afternoonSlot) {
        lines.push(
          `  🌆 Siang/MD (${d.afternoonSlot.shift}): *${d.afternoonSlot.staffName}* — Topic: _${d.afternoonSlot.topic}_`
        );
      } else {
        lines.push('  🌆 Siang/MD: -');
      }
      lines.push('');
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedWa(true);
    setTimeout(() => setCopiedWa(false), 2500);
  };

  const handleExportEmsExcel = () => {
    const scheduleRows = activeSchedule.days.map((d) => ({
      Hari: d.dayName,
      'Staff Shift Pagi': d.morningSlot?.staffName || '-',
      'Shift Pagi': d.morningSlot?.shift || '-',
      'Topic Shift Pagi': d.morningSlot?.topic || '-',
      'Staff Shift Siang / Middle': d.afternoonSlot?.staffName || '-',
      'Shift Siang / Middle': d.afternoonSlot?.shift || '-',
      'Topic Shift Siang / Middle': d.afternoonSlot?.topic || '-'
    }));

    const fairnessRows = fairnessMetrics.map((m) => ({
      'Nama Staff': m.staffName,
      Role: m.role,
      'Total EMS / Minggu': m.totalCount,
      'Jatah Pagi': m.morningCount,
      'Jatah Siang / Middle': m.afternoonCount,
      'Hari & Sesi': m.days.join(', '),
      'Daftar Topic': m.topics.join(', ')
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleRows), 'EMS Schedule Mingguan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fairnessRows), 'Pemerataan Staff EMS');
    XLSX.writeFile(wb, `EMS_Schedule_Mingguan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (staffList.length === 0) {
    return (
      <div className="text-center py-14 px-6 bg-zinc-50/80 rounded-2xl border border-dashed border-zinc-300 space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h4 className="font-bold text-sm text-zinc-900">Belum Ada Schedule Staff Aktif</h4>
      </div>
    );
  }

  if (eligibleStaffList.length === 0) {
    return (
      <div className="text-center py-14 px-6 bg-amber-50/80 rounded-2xl border border-dashed border-amber-300 space-y-2">
        <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
        <h4 className="font-bold text-sm text-amber-950">
          Belum Ada Personil Role &ldquo;Staff&rdquo;
        </h4>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950 text-white p-5 rounded-2xl border border-zinc-800 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/20">
                <CalendarClock className="w-5 h-5" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-sm sm:text-base text-white">
                  EMS Schedule Mingguan (2 Staff / Hari)
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-200 border border-blue-400/30">
                  Khusus Role: Staff
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Cloud Real-Time
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRegenerateFair}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white transition flex items-center space-x-1.5 shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>Generate Ulang Merata</span>
            </button>

            <button
              onClick={handleCopyWhatsApp}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition flex items-center space-x-1.5"
            >
              {copiedWa ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Tersalin ke WA!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin WhatsApp</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportEmsExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Topic Balance Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/10">
          {EMS_TOPICS.map((topic) => {
            const meta = getTopicBadgeMeta(topic);
            return (
              <div
                key={topic}
                className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="p-1 bg-white rounded-lg shrink-0">{meta.icon}</span>
                  <span className="text-[11px] font-semibold text-zinc-100 truncate">{topic}</span>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-300 ml-2 shrink-0">
                  {topicCounts[topic] || 0}x
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {saveMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {/* 7-Day Schedule List (2 Staff per Day: 1 Pagi + 1 Siang/Middle) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeSchedule.days.map((day) => {
          const onDutyToday = eligibleStaffList.filter((s) => !isShiftOff(s.shifts[day.dayIndex]));

          const renderSlotCard = (
            slotKey: 'morningSlot' | 'afternoonSlot',
            label: string,
            icon: React.ReactNode,
            accentClasses: string
          ) => {
            const slot = day[slotKey];
            if (!slot) {
              return (
                <div className="p-3 rounded-xl bg-zinc-50 border border-dashed border-zinc-200 text-xs text-zinc-400">
                  Tidak ada staff bertugas untuk slot {label} hari ini.
                </div>
              );
            }

            const shiftStyle = getShiftBadgeStyle(slot.shift);
            const topicMeta = getTopicBadgeMeta(slot.topic);

            return (
              <div className={`p-3.5 rounded-2xl border transition space-y-2.5 ${accentClasses}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1.5">
                    {icon}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                      {label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {slot.isFallback && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        Penyesuaian Shift
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${shiftStyle.bg} ${shiftStyle.text} ${shiftStyle.border}`}
                    >
                      Shift {slot.shift}
                    </span>
                  </div>
                </div>

                {/* Staff Selector & Display */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                      Nama Staff
                    </label>
                    <select
                      value={slot.staffName}
                      onChange={(e) =>
                        handleUpdateSlot(day.dayIndex, slotKey, { staffName: e.target.value })
                      }
                      className="w-full text-xs font-bold text-zinc-900 bg-white/90 border border-zinc-200 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    >
                      {onDutyToday.length > 0 ? (
                        onDutyToday.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name} ({s.shifts[day.dayIndex]})
                          </option>
                        ))
                      ) : (
                        <option value={slot.staffName}>{slot.staffName}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-500 mb-1">
                      Topic EMS
                    </label>
                    <select
                      value={slot.topic}
                      onChange={(e) =>
                        handleUpdateSlot(day.dayIndex, slotKey, { topic: e.target.value as EmsTopic })
                      }
                      className="w-full text-xs font-semibold text-zinc-900 bg-white/90 border border-zinc-200 rounded-xl px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    >
                      {EMS_TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Topic Visual Pill */}
                <div className="flex items-center pt-1">
                  <div
                    className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${topicMeta.bg}`}
                  >
                    {topicMeta.icon}
                    <span>{slot.topic}</span>
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div
              key={day.dayIndex}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-zinc-200/80 p-4 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="w-7 h-7 rounded-xl bg-zinc-900 text-white text-xs font-bold flex items-center justify-center">
                    {day.dayIndex + 1}
                  </span>
                  <div>
                    <h5 className="font-bold text-sm text-zinc-900">{day.dayName}</h5>
                    <p className="text-[10px] text-zinc-500">
                      {onDutyToday.length} staff bertugas hari ini
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700">
                  2 Schedule Staff
                </span>
              </div>

              <div className="space-y-2.5">
                {renderSlotCard(
                  'morningSlot',
                  'Slot 1 • Shift Pagi',
                  <Sun className="w-3.5 h-3.5 text-amber-500" />,
                  'bg-sky-50/50 border-sky-200/70'
                )}
                {renderSlotCard(
                  'afternoonSlot',
                  'Slot 2 • Shift Siang / Middle',
                  <Sunset className="w-3.5 h-3.5 text-purple-500" />,
                  'bg-purple-50/50 border-purple-200/70'
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fairness Breakdown Table across 1 Week */}
      <div className="bg-white/85 backdrop-blur-xl rounded-2xl border border-zinc-200/80 p-4 sm:p-5 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <h5 className="font-bold text-xs sm:text-sm text-zinc-900">
              Rekap Pemerataan EMS Mingguan
            </h5>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-[11px] text-zinc-500 uppercase">
                <th className="py-2 pr-3 font-semibold">Nama Staff</th>
                <th className="py-2 px-3 font-semibold text-center">Total EMS</th>
                <th className="py-2 px-3 font-semibold text-center">Pagi</th>
                <th className="py-2 px-3 font-semibold text-center">Siang / MD</th>
                <th className="py-2 px-3 font-semibold">Jadwal Hari</th>
                <th className="py-2 pl-3 font-semibold">Topic Diberikan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {fairnessMetrics.map((m) => (
                <tr key={m.staffName} className="hover:bg-zinc-50/80">
                  <td className="py-2.5 pr-3 font-bold text-zinc-900">{m.staffName}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-mono font-bold">
                      {m.totalCount}x
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-sky-700 font-semibold">
                    {m.morningCount}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-purple-700 font-semibold">
                    {m.afternoonCount}
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-zinc-600">
                    {m.days.length > 0 ? m.days.join(', ') : '-'}
                  </td>
                  <td className="py-2.5 pl-3">
                    <div className="flex flex-wrap gap-1">
                      {m.topics.length > 0 ? (
                        m.topics.map((t, idx) => {
                          const tMeta = getTopicBadgeMeta(t);
                          return (
                            <span
                              key={`${m.staffName}-${idx}`}
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${tMeta.bg}`}
                            >
                              {tMeta.icon}
                              <span>{t}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-zinc-400 text-[11px]">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
