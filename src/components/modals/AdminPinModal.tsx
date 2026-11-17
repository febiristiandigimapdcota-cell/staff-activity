import React, { useState } from 'react';
import { X, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onResetToDefault?: () => void;
  expectedPin: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  expectedPin
}) => {
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = pin.trim().toLowerCase();
    const cleanExpected = (expectedPin || '').trim().toLowerCase();

    // Universal match conditions:
    // 1. Password default 'admin' (case-insensitive: admin, Admin, ADMIN)
    // 2. Legacy PIN '1234'
    // 3. Configured password from Firestore/state (case-insensitive & exact)
    const isMatch =
      cleanPin === 'admin' ||
      cleanPin === '1234' ||
      (cleanExpected !== '' && cleanPin === cleanExpected) ||
      (expectedPin && pin.trim() === expectedPin.trim());

    if (isMatch) {
      setError(false);
      setPin('');
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="liquid-glass-modal rounded-[28px] max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-end mb-1">
          <button
            onClick={() => {
              setPin('');
              setError(false);
              onClose();
            }}
            className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg transition"
            aria-label="Tutup Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="w-13 h-13 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner border border-amber-200/60">
          <ShieldCheck className="w-6 h-6" />
        </div>

        <h3 className="font-bold text-zinc-900 text-base mb-5">Akses Area Admin</h3>

        <form onSubmit={handleVerify} className="space-y-3.5">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              maxLength={40}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              placeholder="Masukkan password admin..."
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className={`w-full text-center text-sm font-mono tracking-wider border rounded-xl py-2.5 pl-4 pr-10 focus:ring-2 focus:ring-zinc-900 focus:outline-none transition ${
                error
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : 'border-zinc-300 bg-zinc-50 hover:bg-white focus:bg-white'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition"
              tabIndex={-1}
              title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl font-medium text-center">
              Password tidak sesuai. Silakan periksa kembali password Anda.
            </div>
          )}

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setPin('');
                setError(false);
                onClose();
              }}
              className="w-1/3 py-2.5 border border-zinc-300 text-zinc-700 rounded-xl text-xs font-medium hover:bg-zinc-100 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="w-2/3 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center justify-center space-x-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verifikasi & Masuk</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

