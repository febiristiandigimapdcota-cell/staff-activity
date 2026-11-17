import React, { useState } from 'react';
import { X, Send } from 'lucide-react';
import { StaffMember, ActivityType } from '../../types';

interface SubmitRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  onSubmitRecord: (staffId: number, type: ActivityType, count: number) => void;
}

export const SubmitRecordModal: React.FC<SubmitRecordModalProps> = ({
  isOpen,
  onClose,
  staffList,
  onSubmitRecord
}) => {
  const [activityType, setActivityType] = useState<ActivityType>('OPS');
  const [selectedStaffId, setSelectedStaffId] = useState<number>(staffList[0]?.id || 1);
  const [count, setCount] = useState<number>(1);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitRecord(selectedStaffId, activityType, count);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="liquid-glass-modal rounded-[28px] max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-sm">Submit Form Activity Record</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-800 transition p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-zinc-700 mb-1.5">Jenis Aktivitas</label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityType)}
              className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 font-medium"
            >
              <option value="OPS">🎬 Open Studio (OPS)</option>
              <option value="TryOn_iPad">📱 Try-On iPad (Aksara)</option>
              <option value="TryOn_AirPods">🎧 Try-On AirPods (Samudra)</option>
              <option value="TryOn_Watch">⌚ Try-On Apple Watch (Nirwana)</option>
              <option value="WeeklySeed">🌱 Weekly Seed</option>
              <option value="Checklist">📋 Daily Checklist Toko</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1.5">Staf Bertugas</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(Number(e.target.value))}
              disabled={staffList.length === 0}
              className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 font-medium disabled:opacity-60"
            >
              {staffList.length === 0 ? (
                <option value={0}>Belum ada staf (Unggah schedule di Area Admin)</option>
              ) : (
                staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role || 'Staff'})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 mb-1.5">Jumlah / Penambahan (+ Count)</label>
            <input
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
              className="w-full border border-zinc-300 rounded-xl p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 font-mono text-sm"
            />
          </div>

          <div className="mt-6 pt-3 border-t border-zinc-100 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded-xl text-xs font-medium hover:bg-zinc-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={staffList.length === 0}
              className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-medium hover:bg-zinc-800 disabled:opacity-50 transition shadow-sm flex items-center space-x-1 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              <span>Simpan Record</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
