import React, { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { PhotoRecord } from '../../types';
import {
  fetchDriveImageBase64,
  getCachedDriveImageDataUrl
} from '../../services/driveStorageService';

interface DrivePhotoImgProps {
  photo: Pick<PhotoRecord, 'photoUrl' | 'driveFileId' | 'note' | 'staffName' | 'activityType'>;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export const DrivePhotoImg: React.FC<DrivePhotoImgProps> = ({
  photo,
  alt,
  className = '',
  loading = 'lazy'
}) => {
  const cachedDataUrl = getCachedDriveImageDataUrl(photo.driveFileId);
  const initialSrc =
    cachedDataUrl ||
    photo.photoUrl ||
    (photo.driveFileId ? `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w1000` : '');

  const [src, setSrc] = useState<string>(initialSrc);
  const [stage, setStage] = useState<'primary' | 'lh3' | 'appsScript' | 'failed'>(
    cachedDataUrl ? 'appsScript' : 'primary'
  );

  useEffect(() => {
    const cached = getCachedDriveImageDataUrl(photo.driveFileId);
    const nextInitial =
      cached ||
      photo.photoUrl ||
      (photo.driveFileId ? `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w1000` : '');
    setSrc(nextInitial);
    setStage(cached ? 'appsScript' : 'primary');
  }, [photo.photoUrl, photo.driveFileId]);

  const handleError = () => {
    if (stage === 'primary' && photo.driveFileId) {
      setStage('lh3');
      setSrc(`https://lh3.googleusercontent.com/d/${photo.driveFileId}=w1000`);
      return;
    }

    if ((stage === 'primary' || stage === 'lh3') && photo.driveFileId) {
      setStage('appsScript');
      void fetchDriveImageBase64(photo.driveFileId).then((dataUrl) => {
        if (dataUrl) {
          setSrc(dataUrl);
        } else {
          setStage('failed');
        }
      });
      return;
    }

    setStage('failed');
  };

  if (!src || stage === 'failed') {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-3 text-center ${className}`}
      >
        <ImageOff className="w-5 h-5 mb-1 opacity-70" />
        <span className="text-[10px] font-medium">Pratinjau Drive</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || photo.note || photo.staffName || photo.activityType}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
};
