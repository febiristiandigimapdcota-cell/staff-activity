import React, { useState, useMemo } from 'react';
import {
  GraduationCap,
  Calendar,
  Clock,
  PlusCircle,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  User,
  Sun,
  Sunset
} from 'lucide-react';
import { TrainingHoItem, TrainingHoScheduleData } from '../../types';
import { DAYS_ID } from '../../data/defaultData';
import { getTrainingSessionGroup, isAutoTrainingDescription } from '../../utils/scheduler';

interface TrainingHoPanelProps {
  trainingHoSchedule: TrainingHoScheduleData | null;
  onSaveTrainingHo: (data: TrainingHoScheduleData) => Promise<void>;
}

const getLocalIsoDate = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayIndexFromIsoDate = (isoDate: string): number => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return (parsed.getDay() + 6) % 7;
};

const formatDisplayDate = (isoDate: string): string => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const getCurrentWeekDates = (): { dayIndex: number; dayName: string; isoDate: string }[] => {
  const today = new Date();
  const currentDayIdx = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - currentDayIdx);

  return DAYS_ID.map((dayName, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return {
      dayIndex: idx,
      dayName,
      isoDate: getLocalIsoDate(d)
    };
  });
};

const TIME_PRESETS = [
  { label: '09:00 - 12:00', start: '09:00', end: '12:00', session: 'TRP' as const },
  { label: '10:00 - 12:00', start: '10:00', end: '12:00', session: 'TRP' as const },
  { label: '13:00 - 16:00', start: '13:00', end: '16:00', session: 'TRS' as const },
  { label: '14:00 - 16:00', start: '14:00', end: '16:00', session: 'TRS' as const }
];

const parseTimeRange = (timeStr: string): { start: string; end: string } => {
  const match = timeStr.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  if (match) {
    return { start: match[1], end: match[2] };
  }
  return { start: '09:00', end: '12:00' };
};

export const TrainingHoPanel: React.FC<TrainingHoPanelProps> = ({
  trainingHoSchedule,
  onSaveTrainingHo
}) => {
  const todayIso = useMemo(() => getLocalIsoDate(), []);
  const weekDates = useMemo(() => getCurrentWeekDates(), []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState<string>(todayIso);
  const [sessionGroup, setSessionGroup] = useState<'TRP' | 'TRS'>('TRP');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('12:00');
  const [topicInput, setTopicInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const items = useMemo(() => {
    const raw = trainingHoSchedule?.items || [];
    return [...raw].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [trainingHoSchedule]);

  const morningItems = useMemo(
    () => items.filter((it) => getTrainingSessionGroup(it) === 'TRP'),
    [items]
  );
  const afternoonItems = useMemo(
    () => items.filter((it) => getTrainingSessionGroup(it) === 'TRS'),
    [items]
  );

  const computedDayIndex = useMemo(() => getDayIndexFromIsoDate(dateInput), [dateInput]);
  const computedDayName = DAYS_ID[computedDayIndex] || 'Senin';

  const resetForm = () => {
    setEditingId(null);
    setDateInput(todayIso);
    setSessionGroup('TRP');
    setStartTime('09:00');
    setEndTime('12:00');
    setTopicInput('');
  };

  const handleSelectSessionGroup = (group: 'TRP' | 'TRS') => {
    setSessionGroup(group);
    if (group === 'TRP') {
      setStartTime('09:00');
      setEndTime('12:00');
    } else {
      setStartTime('13:00');
      setEndTime('16:00');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateInput) {
      setFeedback({ type: 'error', message: 'Silakan pilih tanggal training.' });
      return;
    }
    if (!startTime || !endTime) {
      setFeedback({ type: 'error', message: 'Silakan isi jam mulai dan jam selesai.' });
      return;
    }

    const formattedTime = `${startTime} - ${endTime} WIB`;
    const nowIso = new Date().toISOString();

    const existing = trainingHoSchedule?.items || [];
    const existingEditingItem = editingId ? existing.find((it) => it.id === editingId) : undefined;
    const cleanTopic = topicInput.trim();

    const nextItem: TrainingHoItem = {
      id: editingId || `tho_${Date.now()}`,
      dayIndex: computedDayIndex,
      dayName: computedDayName,
      date: dateInput,
      time: formattedTime,
      trainingSession: sessionGroup,
      ...(cleanTopic ? { topic: cleanTopic } : {}),
      ...(existingEditingItem?.isAutoFromSchedule
        ? {
            staffName: existingEditingItem.staffName,
            staffRole: existingEditingItem.staffRole,
            shiftCode: existingEditingItem.shiftCode,
            isAutoFromSchedule: true
          }
        : {}),
      createdAt: existingEditingItem?.createdAt || nowIso
    };

    const nextItems = editingId
      ? existing.map((it) => (it.id === editingId ? nextItem : it))
      : [...existing, nextItem];

    setIsSaving(true);
    setFeedback(null);
    try {
      await onSaveTrainingHo({
        items: nextItems,
        updatedAt: nowIso
      });
      setFeedback({
        type: 'success',
        message: editingId
          ? `Jadwal Training HO (${computedDayName}, ${formatDisplayDate(dateInput)}) diperbarui.`
          : `Jadwal Training HO (${computedDayName}, ${formatDisplayDate(dateInput)}) ditambahkan.`
      });
      resetForm();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Gagal menyimpan: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item: TrainingHoItem) => {
    const parsedTime = parseTimeRange(item.time);
    setEditingId(item.id);
    setDateInput(item.date);
    setSessionGroup(getTrainingSessionGroup(item));
    setStartTime(parsedTime.start);
    setEndTime(parsedTime.end);
    setTopicInput(item.topic && !isAutoTrainingDescription(item.topic) ? item.topic : '');
    setFeedback(null);
  };

  const handleDelete = async (id: string) => {
    const nextItems = (trainingHoSchedule?.items || []).filter((it) => it.id !== id);
    const nowIso = new Date().toISOString();
    setIsSaving(true);
    setFeedback(null);
    try {
      await onSaveTrainingHo({
        items: nextItems,
        updatedAt: nowIso
      });
      if (editingId === id) resetForm();
      setFeedback({
        type: 'success',
        message: 'Jadwal Training HO dihapus.'
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Gagal menghapus: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderGroupSection = (
    title: string,
    groupItems: TrainingHoItem[],
    icon: React.ReactNode,
    containerCls: string,
    badgeCls: string
  ) => (
    <div className={`rounded-2xl p-4 border space-y-3 ${containerCls}`}>
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200/70">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-xl bg-white border border-zinc-200/80 flex items-center justify-center shadow-2xs">
            {icon}
          </div>
          <h6 className="font-bold text-xs sm:text-sm text-zinc-900">{title}</h6>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${badgeCls}`}>
          {groupItems.length} Jadwal
        </span>
      </div>

      {groupItems.length === 0 ? (
        <p className="text-[11px] text-zinc-400 text-center py-4">Tidak ada {title}</p>
      ) : (
        <div className="space-y-2.5">
          {groupItems.map((item) => {
            const isToday = item.date === todayIso;
            const customTopic =
              item.topic && !isAutoTrainingDescription(item.topic) ? item.topic : null;
            return (
              <div
                key={item.id}
                className={`rounded-2xl p-3.5 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isToday
                    ? 'bg-emerald-50/90 border-emerald-300 shadow-xs'
                    : 'bg-white border-zinc-200/90 hover:border-zinc-300 shadow-2xs'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-zinc-900 text-white">
                      {item.dayName}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-white border border-zinc-200 text-zinc-800">
                      {formatDisplayDate(item.date)}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {item.time}
                    </span>
                    {isToday && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        Hari Ini
                      </span>
                    )}
                  </div>

                  {item.staffName && (
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-900">
                      <User className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>{item.staffName}</span>
                      {item.staffRole && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                          {item.staffRole}
                        </span>
                      )}
                    </div>
                  )}

                  {customTopic && (
                    <h6 className="font-semibold text-xs text-zinc-700 truncate">{customTopic}</h6>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition flex items-center space-x-1 cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{item.isAutoFromSchedule ? 'Ubah Jam' : 'Edit'}</span>
                  </button>
                  {!item.isAutoFromSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Hapus jadwal Training HO pada ${item.dayName}, ${formatDisplayDate(item.date)} (${item.time})?`
                          )
                        ) {
                          void handleDelete(item.id);
                        }
                      }}
                      disabled={isSaving}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition flex items-center space-x-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-900 text-white p-5 rounded-2xl border border-emerald-500/30 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-sm sm:text-base text-white">Jadwal Training HO</h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-400/30 text-xs font-mono font-bold">
            Pagi: {morningItems.length}
          </span>
          <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-mono font-bold">
            Siang: {afternoonItems.length}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          <div className="flex items-center space-x-2 font-semibold">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline ml-2 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Add/Edit Training HO */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-zinc-50/90 p-5 rounded-2xl border border-zinc-200/90 space-y-4 h-fit"
        >
          <div className="flex items-center justify-between border-b border-zinc-200/70 pb-3">
            <h5 className="font-bold text-xs sm:text-sm text-zinc-900 flex items-center space-x-2">
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>{editingId ? 'Edit Jadwal Training HO' : 'Tambah Jadwal Training HO'}</span>
            </h5>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
              >
                Batal Edit
              </button>
            )}
          </div>

          {/* Kelompok Training Pagi / Siang */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 block">Kelompok Sesi:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectSessionGroup('TRP')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                  sessionGroup === 'TRP'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Training Pagi</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSessionGroup('TRS')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                  sessionGroup === 'TRS'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <Sunset className="w-3.5 h-3.5" />
                <span>Training Siang</span>
              </button>
            </div>
          </div>

          {/* Quick Day-of-Week Selector for Current Week */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 block">Pilih Hari:</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 gap-1.5">
              {weekDates.map((wd) => {
                const isSelected = dateInput === wd.isoDate;
                return (
                  <button
                    key={wd.dayIndex}
                    type="button"
                    onClick={() => setDateInput(wd.isoDate)}
                    className={`px-2 py-1.5 rounded-xl text-[11px] font-semibold transition border cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {wd.dayName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exact Calendar Date Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span>Tanggal</span>
              </label>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                required
                className="w-full text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-700 block">Hari</label>
              <div className="w-full text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-2 font-bold flex items-center justify-between">
                <span>{computedDayName}</span>
                <span className="text-[10px] font-mono text-emerald-700">
                  {dateInput ? formatDisplayDate(dateInput) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Time Inputs */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-700 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Jam Training (WIB)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-500 block mb-1">Mulai</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none font-mono"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block mb-1">Selesai</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Quick Time Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TIME_PRESETS.map((preset) => {
                const active = startTime === preset.start && endTime === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start);
                      setEndTime(preset.end);
                      setSessionGroup(preset.session);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold border transition cursor-pointer ${
                      active
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Topic */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-700 flex items-center space-x-1">
              <BookOpen className="w-3.5 h-3.5 text-zinc-500" />
              <span>Materi (Opsional)</span>
            </label>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="Materi training..."
              className="w-full text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-400 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isSaving
                ? 'Menyimpan...'
                : editingId
                ? 'Simpan Perubahan'
                : 'Simpan Jadwal Training HO'}
            </span>
          </button>
        </form>

        {/* Grouped List: Training Pagi & Training Siang */}
        <div className="lg:col-span-7 space-y-4">
          {items.length === 0 ? (
            <div className="bg-zinc-50/80 border border-dashed border-zinc-300 rounded-2xl p-10 text-center space-y-2">
              <GraduationCap className="w-9 h-9 text-zinc-300 mx-auto" />
              <p className="text-xs font-semibold text-zinc-700">
                Belum ada jadwal Training HO
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {renderGroupSection(
                'Training Pagi',
                morningItems,
                <Sun className="w-4 h-4 text-amber-600" />,
                'bg-amber-50/45 border-amber-200/80',
                'bg-amber-100 text-amber-800 border-amber-200'
              )}
              {renderGroupSection(
                'Training Siang',
                afternoonItems,
                <Sunset className="w-4 h-4 text-emerald-700" />,
                'bg-emerald-50/45 border-emerald-200/80',
                'bg-emerald-100 text-emerald-800 border-emerald-200'
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
