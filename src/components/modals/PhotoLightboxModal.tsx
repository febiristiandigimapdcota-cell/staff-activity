import React from 'react';
import { X, Download, User, Calendar, Tag, FileText } from 'lucide-react';
import { PhotoRecord } from '../../types';
import { downloadPhotoRecord } from '../../utils/downloadHelper';
import { DrivePhotoImg } from '../common/DrivePhotoImg';

interface PhotoLightboxModalProps {
  photo: PhotoRecord | null;
  onClose: () => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  photo,
  onClose
}) => {
  if (!photo) return null;

  const handleDownload = () => {
    void downloadPhotoRecord(photo);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center px-5 py-3 border-b border-zinc-100">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 text-white shrink-0">
              {photo.activityType}
            </span>
            <h3 className="font-bold text-xs text-zinc-900 truncate">{photo.staffName}</h3>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {photo.driveWebViewLink && (
              <a
                href={photo.driveWebViewLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Buka di Google Drive"
                className="px-2.5 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center space-x-1 transition font-medium"
              >
                <span>Buka di Drive</span>
              </a>
            )}
            <button
              onClick={handleDownload}
              title="Download Gambar"
              className="px-2.5 py-1 text-xs bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg flex items-center space-x-1.5 transition font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-800 transition hover:bg-zinc-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 bg-zinc-950 flex items-center justify-center max-h-[60vh]">
          <DrivePhotoImg
            photo={photo}
            alt={photo.note}
            loading="eager"
            className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-md"
          />
        </div>

        <div className="p-5 bg-white text-xs space-y-3">
          <div className="grid grid-cols-2 gap-3 text-zinc-600">
            <div className="flex items-center space-x-2">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span>Staf: <strong className="text-zinc-900">{photo.staffName}</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-mono text-[11px]">{photo.timestamp}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Tag className="w-3.5 h-3.5 text-zinc-400" />
              <span>Kategori: <strong className="text-zinc-900">{photo.activityType}</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  photo.syncedToDrive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              ></span>
              <span className={photo.syncedToDrive ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                {photo.syncedToDrive ? 'Tersimpan di Google Drive' : 'Tersimpan di Cache Lokal'}
              </span>
            </div>
            {photo.customerType && (
              <div className="flex items-center space-x-2 col-span-2">
                <span className="text-zinc-500 font-medium">Tipe Pelanggan:</span>
                <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-zinc-900 text-white">
                  {photo.customerType === 'iPhone Purchaser' ? '🛍️ iPhone Purchaser' : '🔍 Browser'}
                </span>
                {photo.programCampaign && (
                  <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] bg-zinc-100 text-zinc-800 border border-zinc-200">
                    Campaign: {photo.programCampaign}
                  </span>
                )}
              </div>
            )}
          </div>

          {photo.note && (
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-start space-x-2">
              <FileText className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Catatan Bukti</p>
                <p className="text-zinc-800 text-xs mt-0.5">{photo.note}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
