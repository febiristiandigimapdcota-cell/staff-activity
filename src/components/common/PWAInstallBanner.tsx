import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Download,
  Share2,
  X,
  AlertTriangle,
  Smartphone,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isInAppBrowser, install } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  // If already running as standalone installed PWA or user dismissed for this session
  if (isInstalled || isDismissed) {
    return null;
  }

  return (
    <>
      {/* 1. In-App Browser (WhatsApp / Instagram / Line) Warning Banner */}
      {isInAppBrowser && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-md relative z-30">
          <div className="flex items-center space-x-2.5 pr-2">
            <AlertTriangle className="w-4 h-4 text-white shrink-0 animate-bounce" />
            <span className="leading-tight text-[11px] sm:text-xs">
              <strong>Tips Buka di HP:</strong> Buka di <strong>Safari (iPhone)</strong> atau <strong>Chrome (Android)</strong> agar kamera &amp; upload foto tidak terblokir oleh WhatsApp.
            </span>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 shrink-0 cursor-pointer"
            title="Tutup pesan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Mobile Install / Add to Home Screen Banner */}
      {!isInAppBrowser && (isInstallable || isIOS) && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-lg relative z-30">
          <div className="flex items-center space-x-2.5 pr-2 min-w-0">
            <img
              src="/app-logo.png"
              alt="Logo"
              className="w-8 h-8 rounded-xl object-cover border border-white/40 shadow-sm shrink-0"
            />
            <div className="truncate">
              <p className="font-bold text-[11px] sm:text-xs tracking-tight">
                Gunakan Seperti Aplikasi di HP
              </p>
              <p className="text-[10px] text-blue-100 hidden sm:block">
                Tambahkan ke Layar Utama untuk akses 1-klik tanpa perlu ketik link
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {isInstallable && (
              <button
                onClick={install}
                className="px-3 py-1.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-[11px] shadow-sm transition flex items-center space-x-1 cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Instal di HP</span>
              </button>
            )}

            {isIOS && !isInstallable && (
              <button
                onClick={() => setShowIOSModal(true)}
                className="px-3 py-1.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-[11px] shadow-sm transition flex items-center space-x-1 cursor-pointer active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Pasang di iPhone</span>
              </button>
            )}

            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              title="Tutup banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* iOS Safari Guided Installation Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl border border-white/80 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  
                </div>
                <h3 className="font-bold text-sm text-zinc-900">Pasang di iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-zinc-600">
              <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <p>
                  Pastikan web dibuka di browser <strong>Safari</strong> (bukan di dalam WhatsApp / Chrome).
                </p>
              </div>

              <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <p>
                  Tap tombol <strong>Share</strong> (ikon kotak dengan panah ke atas) di bilah bawah Safari.
                </p>
              </div>

              <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <p>
                  Scroll ke bawah dan tap <strong>&quot;Tambah ke Layar Utama&quot;</strong> (<em>Add to Home Screen</em>).
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-semibold transition cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
