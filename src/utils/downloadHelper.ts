import { PhotoRecord } from '../types';
import {
  fetchDriveImageBase64,
  getCachedDriveImageDataUrl
} from '../services/driveStorageService';

function detectImageExtension(url: string): string {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/jpg') || lower.includes('.jpg') || lower.includes('.jpeg')) {
    return 'jpg';
  }
  if (lower.startsWith('data:image/webp') || lower.includes('.webp')) {
    return 'webp';
  }
  if (lower.startsWith('data:image/gif') || lower.includes('.gif')) {
    return 'gif';
  }
  return 'png';
}

export function buildPhotoFilename(photo: PhotoRecord): string {
  const safeStaff = (photo.staffName || 'staf')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeAct = (photo.activityType || 'bukti').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const ext = detectImageExtension(photo.photoUrl || '');
  return `${safeAct}_${safeStaff}_${photo.id}.${ext}`;
}

function triggerAnchorDownload(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a submitted proof photo reliably for base64 data URLs, remote URLs, and Google Drive files.
 */
export async function downloadPhotoRecord(photo: PhotoRecord): Promise<void> {
  if (!photo) return;
  const filename = buildPhotoFilename(photo);

  const cachedDataUrl = getCachedDriveImageDataUrl(photo.driveFileId);
  const sourceUrl = cachedDataUrl || photo.photoUrl;

  if (sourceUrl && sourceUrl.startsWith('data:')) {
    try {
      const response = await fetch(sourceUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerAnchorDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      return;
    } catch {
      // continue to fallback
    }
  }

  if (photo.driveFileId) {
    try {
      const dataUrl = await fetchDriveImageBase64(photo.driveFileId);
      if (dataUrl) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerAnchorDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        return;
      }
    } catch {
      // continue to fallback
    }
  }

  if (sourceUrl) {
    try {
      const response = await fetch(sourceUrl, { mode: 'cors' });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerAnchorDownload(objectUrl, filename);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
        return;
      }
    } catch {
      // Fallback to direct anchor download
    }

    triggerAnchorDownload(sourceUrl, filename);
  }
}
