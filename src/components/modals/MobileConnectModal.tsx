import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Sparkles,
  AlertTriangle,
  QrCode,
  Download
} from 'lucide-react';

import {
  getStoredAppsScriptUrl,
  getStoredFolderId,
  isValidAppsScriptUrl
} from '../../services/driveStorageService';

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  scriptUrl?: string;
  folderId?: string;
}

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  scriptUrl,
  folderId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);

  const effectiveScriptUrl = (scriptUrl || getStoredAppsScriptUrl() || '').trim();
  const effectiveFolderId = (folderId || getStoredFolderId() || '').trim();
  const hasGasConnection = isValidAppsScriptUrl(effectiveScriptUrl);

  // Build shareable URL with embedded ?gas= &folderId= so staff devices auto-connect to Google Drive
  const currentUrl = (() => {
    if (typeof window === 'undefined') return '';
    try {
      const u = new URL(window.location.href);
      if (hasGasConnection) {
        u.searchParams.set('gas', effectiveScriptUrl);
        if (effectiveFolderId) {
          u.searchParams.set('folderId', effectiveFolderId);
        }
      }
      return u.toString();
    } catch {
      return window.location.href;
    }
  })();

  useEffect(() => {
    if (isOpen && canvasRef.current && currentUrl) {
      QRCode.toCanvas(
        canvasRef.current,
        currentUrl,
        {
          width: 220,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'M'
        },
        (error) => {
          if (!error) {
            setQrGenerated(true);
          } else {
            console.error('QR code generation error:', error);
          }
        }
      );
    }
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = currentUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="liquid-glass-modal rounded-[32px] max-w-lg w-full p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-200 border border-white/60 shadow-2xl my-6">
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-zinc-200/60">
          <div className="flex items-center space-x-3">
            <div className="relative shrink-0">
              <img
                src="/app-logo.png"
                alt="Staff Activity Logo"
                className="w-11 h-11 rounded-2xl object-cover border border-white/60 shadow-md"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <h3 className="font-bold text-zinc-900 text-base flex items-center">
              <span>Buka di Handphone Staf</span>
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-700 border border-blue-500/30">
                Scan QR / Link
              </span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Canvas Card */}
        <div className="my-5 flex flex-col items-center justify-center p-5 bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 shadow-inner">
          <div className="p-3 bg-white rounded-2xl border border-zinc-200/80 shadow-md relative">
            <canvas ref={canvasRef} className="rounded-xl block" />
            {!qrGenerated && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl">
                <QrCode className="w-10 h-10 text-zinc-400 animate-pulse" />
              </div>
            )}
          </div>
          <p className="text-xs font-semibold text-zinc-800 mt-3 flex items-center">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 mr-1.5" />
            <span>Arahkan kamera HP staf ke QR Code di atas</span>
          </p>
          {hasGasConnection ? (
            <p className="text-[11px] text-emerald-700 font-medium mt-1 text-center">
              ✓ Link &amp; QR otomatis menghubungkan HP staf ke Database Google Drive toko.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 font-medium mt-1 text-center">
              Catatan: URL Apps Script belum dipasang di Admin. Pasang dulu agar QR otomatis sinkron lintas HP.
            </p>
          )}
        </div>

        {/* Copy Link Option */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider block">
            Atau Bagikan Link URL Toko:
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={currentUrl}
              className="flex-1 bg-white/80 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-700 truncate focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm cursor-pointer shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Troubleshooting & Tips for WhatsApp in-app browser */}
        <div className="mt-5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 text-xs space-y-1.5">
          <div className="flex items-center space-x-2 font-bold text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Penting: Buka di Browser Utama (Bukan WebView WA)</span>
          </div>
          <p className="text-[11px] text-zinc-700 leading-relaxed">
            Jika link dibuka melalui chat WhatsApp, browser bawaan WA sering membatasi akses galeri dan kamera HP.
            Tap tombol <strong>titik tiga (⋮)</strong> di kanan atas WA, lalu pilih <strong>&quot;Buka di Browser / Safari / Chrome&quot;</strong>.
          </p>
        </div>

        {/* Installation to Home Screen Instructions */}
        <div className="mt-4 pt-4 border-t border-zinc-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-white/60 border border-white/80 space-y-1">
            <p className="font-bold text-zinc-900 flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
              iPhone / iPad (Safari)
            </p>
            <ol className="text-[11px] text-zinc-600 list-decimal list-inside space-y-0.5">
              <li>Buka link di <strong>Safari</strong></li>
              <li>Tap tombol <strong>Share</strong> (kotak panah ke atas)</li>
              <li>Pilih <strong>&quot;Tambah ke Layar Utama&quot;</strong></li>
            </ol>
          </div>

          <div className="p-3 rounded-2xl bg-white/60 border border-white/80 space-y-1">
            <p className="font-bold text-zinc-900 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
              Android (Chrome)
            </p>
            <ol className="text-[11px] text-zinc-600 list-decimal list-inside space-y-0.5">
              <li>Buka link di <strong>Chrome</strong></li>
              <li>Tap menu <strong>titik tiga (⋮)</strong> di kanan atas</li>
              <li>Pilih <strong>&quot;Instal Aplikasi / Tambah ke Layar Utama&quot;</strong></li>
            </ol>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-zinc-900 hover:bg-black text-white text-xs font-semibold rounded-2xl transition shadow-md cursor-pointer"
          >
            Mengerti &amp; Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
