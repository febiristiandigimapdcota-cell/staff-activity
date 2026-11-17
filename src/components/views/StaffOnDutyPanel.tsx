import React, { useState, useRef, useMemo } from 'react';
import {
  UserCheck,
  Upload,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Mail,
  IdCard,
  Clock,
  Users,
  Camera,
  RotateCcw
} from 'lucide-react';
import { StaffMember, StaffProfile } from '../../types';
import { compressImageFile } from '../../utils/imageCompressor';
import {
  buildStaffProfileId,
  buildStaffProfileMap,
  lookupStaffProfile,
  calculateWorkTenure
} from '../../utils/staffProfileHelper';
import { isStaffRole } from '../../utils/scheduler';
import { StaffAvatar } from '../common/StaffAvatar';

interface StaffOnDutyPanelProps {
  staffList: StaffMember[];
  staffProfiles: StaffProfile[];
  onSaveStaffProfile: (profile: StaffProfile) => Promise<void>;
  onDeleteStaffProfile: (profileId: string) => Promise<void>;
}

const ROLE_OPTIONS = ['Staff', 'Leader', 'Assistant Manager', 'Manager', 'Cashier', 'VM', 'Admin'];

export const StaffOnDutyPanel: React.FC<StaffOnDutyPanelProps> = ({
  staffList,
  staffProfiles,
  onSaveStaffProfile,
  onDeleteStaffProfile
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState('Staff');
  const [nikInput, setNikInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [joinDateInput, setJoinDateInput] = useState('');
  const [workTenureInput, setWorkTenureInput] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const profileMap = useMemo(() => buildStaffProfileMap(staffProfiles), [staffProfiles]);

  // Sort roster Staff role first so Admin can fill Staff data quickly
  const sortedRoster = useMemo(() => {
    return [...staffList].sort((a, b) => {
      const aStaff = isStaffRole(a.role) ? 0 : 1;
      const bStaff = isStaffRole(b.role) ? 0 : 1;
      if (aStaff !== bStaff) return aStaff - bStaff;
      return a.name.localeCompare(b.name);
    });
  }, [staffList]);

  const computedTenurePreview = useMemo(
    () => calculateWorkTenure(joinDateInput, workTenureInput),
    [joinDateInput, workTenureInput]
  );

  const resetForm = () => {
    setEditingId(null);
    setNameInput('');
    setRoleInput('Staff');
    setNikInput('');
    setEmailInput('');
    setJoinDateInput('');
    setWorkTenureInput('');
    setPhotoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadForEdit = (profile: StaffProfile) => {
    setEditingId(profile.id);
    setNameInput(profile.name);
    setRoleInput(profile.role || 'Staff');
    setNikInput(profile.nik || '');
    setEmailInput(profile.email || '');
    setJoinDateInput(profile.joinDate || '');
    setWorkTenureInput(profile.workTenure || '');
    setPhotoUrl(profile.photoUrl || '');
    setFeedback(null);
  };

  const handleQuickPickRoster = (member: StaffMember) => {
    const existing = lookupStaffProfile(profileMap, member.name);
    if (existing) {
      handleLoadForEdit(existing);
      return;
    }
    setEditingId(null);
    setNameInput(member.name);
    setRoleInput(member.role || 'Staff');
    setNikInput('');
    setEmailInput('');
    setJoinDateInput('');
    setWorkTenureInput('');
    setPhotoUrl('');
    setFeedback(null);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingPhoto(true);
    setFeedback(null);
    try {
      const compressed = await compressImageFile(file, 420, 0.72);
      setPhotoUrl(compressed.base64);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses foto staff.'
      });
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nameInput.trim();
    if (!cleanName) {
      setFeedback({ type: 'error', message: 'Nama staff wajib diisi.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const existingByName = lookupStaffProfile(profileMap, cleanName);
      const profileId = editingId || existingByName?.id || buildStaffProfileId(cleanName);
      const tenureToSave =
        workTenureInput.trim() ||
        (joinDateInput ? calculateWorkTenure(joinDateInput) : '');

      const payload: StaffProfile = {
        id: profileId,
        name: cleanName,
        role: roleInput.trim() || 'Staff',
        photoUrl,
        nik: nikInput.trim(),
        email: emailInput.trim(),
        joinDate: joinDateInput.trim(),
        workTenure: tenureToSave,
        updatedAt: new Date().toISOString()
      };

      await onSaveStaffProfile(payload);
      setFeedback({
        type: 'success',
        message: `Data Staff On Duty "${cleanName}" tersimpan & otomatis tersinkron ke semua jadwal.`
      });
      resetForm();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Gagal menyimpan data: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (profile: StaffProfile) => {
    if (!confirm(`Hapus profil Staff On Duty "${profile.name}"?`)) return;
    try {
      await onDeleteStaffProfile(profile.id);
      if (editingId === profile.id) resetForm();
      setFeedback({
        type: 'success',
        message: `Data "${profile.name}" telah dihapus.`
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Gagal menghapus data: ${err instanceof Error ? err.message : 'Periksa koneksi.'}`
      });
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold underline shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Quick Pick from Active Roster */}
      {sortedRoster.length > 0 && (
        <div className="p-4 rounded-2xl bg-zinc-50/90 border border-zinc-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-700 flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-600" />
              <span>Pilih Cepat dari Roster Aktif:</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              {staffProfiles.length} Profil Terisi
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortedRoster.map((m) => {
              const existing = lookupStaffProfile(profileMap, m.name);
              const isSelected = nameInput.trim().toLowerCase() === m.name.trim().toLowerCase();
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleQuickPickRoster(m)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition flex items-center space-x-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : existing
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <StaffAvatar name={m.name} photoUrl={existing?.photoUrl} size="xs" />
                  <span>{m.name}</span>
                  {existing && (
                    <CheckCircle2
                      className={`w-3 h-3 shrink-0 ${
                        isSelected ? 'text-emerald-300' : 'text-emerald-600'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="p-4 sm:p-5 rounded-2xl bg-zinc-50/80 border border-zinc-200/90 space-y-4"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200/70">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-xs sm:text-sm text-zinc-900">
              {editingId ? `Edit Data Karyawan: ${nameInput}` : 'Tambah / Update Data Staff On Duty'}
            </h4>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 flex items-center space-x-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Batal Edit</span>
            </button>
          )}
        </div>

        {/* Photo Upload Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-2xl bg-white border border-zinc-200/80">
          <div className="flex items-center space-x-3.5">
            <StaffAvatar name={nameInput || 'Staff'} photoUrl={photoUrl} size="xl" />
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-zinc-900">Foto Karyawan / Staff</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCompressingPhoto}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-60"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isCompressingPhoto ? 'Memproses...' : photoUrl ? 'Ganti Foto' : 'Upload Foto'}</span>
                </button>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoUrl('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold cursor-pointer"
                  >
                    Hapus Foto
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Text Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Nama Lengkap Staff <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Contoh: Ahmad Fauzi"
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Role / Posisi</label>
            <select
              value={ROLE_OPTIONS.includes(roleInput) ? roleInput : 'CUSTOM'}
              onChange={(e) => {
                if (e.target.value !== 'CUSTOM') setRoleInput(e.target.value);
              }}
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              {!ROLE_OPTIONS.includes(roleInput) && (
                <option value="CUSTOM">{roleInput}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">NIK</label>
            <input
              type="text"
              value={nikInput}
              onChange={(e) => setNikInput(e.target.value)}
              placeholder="Contoh: 202401001"
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white font-mono focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Contoh: nama@digimap.co.id"
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Tanggal Mulai Bekerja
            </label>
            <input
              type="date"
              value={joinDateInput}
              onChange={(e) => setJoinDateInput(e.target.value)}
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white font-mono focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
            {joinDateInput && (
              <p className="text-[10px] font-semibold text-emerald-700 mt-1">
                Masa Bekerja Otomatis: {computedTenurePreview}
              </p>
            )}
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Masa Bekerja (Opsional / Manual)
            </label>
            <input
              type="text"
              value={workTenureInput}
              onChange={(e) => setWorkTenureInput(e.target.value)}
              placeholder="Otomatis dari tanggal atau ketik mis. 2 Tahun 3 Bulan"
              className="w-full border border-zinc-300 rounded-xl p-2.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving || isCompressingPhoto || !nameInput.trim()}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>
            {isSaving
              ? 'Menyimpan...'
              : editingId
              ? 'Update Data Staff On Duty'
              : 'Simpan Data Staff On Duty'}
          </span>
        </button>
      </form>

      {/* Saved Staff Profiles Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs sm:text-sm text-zinc-900 flex items-center space-x-2">
            <Users className="w-4 h-4 text-zinc-700" />
            <span>Daftar Karyawan / Staff On Duty ({staffProfiles.length})</span>
          </h4>
        </div>

        {staffProfiles.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 text-xs text-zinc-500">
            Belum ada data Staff On Duty yang tersimpan. Gunakan form di atas untuk menambahkan data karyawan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {staffProfiles.map((profile) => {
              const tenureDisplay = calculateWorkTenure(profile.joinDate, profile.workTenure);
              return (
                <div
                  key={profile.id}
                  className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center space-x-3 min-w-0">
                      <StaffAvatar name={profile.name} photoUrl={profile.photoUrl} size="lg" />
                      <div className="min-w-0">
                        <h5 className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                          {profile.name}
                        </h5>
                        <span
                          className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            isStaffRole(profile.role)
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                          }`}
                        >
                          {profile.role || 'Staff'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadForEdit(profile)}
                        className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition cursor-pointer"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(profile)}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition cursor-pointer"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-zinc-100 space-y-1.5 text-[11px] text-zinc-600">
                    <div className="flex items-center space-x-2">
                      <IdCard className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="font-mono font-semibold text-zinc-800 truncate">
                        NIK: {profile.nik || '-'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{profile.email || '-'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="font-semibold text-emerald-700 truncate">
                        Masa Bekerja: {tenureDisplay}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
