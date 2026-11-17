/**
 * Utility to compress client-side images before sending to Cloud Firestore.
 * Firestore documents have a strict 1MB limit. High-resolution mobile phone camera
 * pictures and screenshots (2MB - 12MB) will fail to write to Firestore without compression.
 * This utility resizes the image to a maximum dimension of 1080px and applies JPEG compression
 * (quality ~0.75), yielding crisp, clear images typically between 40KB - 90KB.
 */

export interface CompressionResult {
  base64: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
}

export function compressImageFile(
  file: File,
  initialMaxDimension = 760,
  initialQuality = 0.62
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan gambar yang valid.'));
      return;
    }

    const originalSizeBytes = file.size;
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));

    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memproses gambar. Pastikan format file didukung (JPG, PNG, WebP).'));
      img.onload = () => {
        // Multi-pass adaptive compression to keep payload fast (~55-110KB) for rapid multi-device sync
        const passes = [
          { maxDim: initialMaxDimension, quality: initialQuality },
          { maxDim: 640, quality: 0.56 },
          { maxDim: 540, quality: 0.50 },
          { maxDim: 460, quality: 0.44 }
        ];

        let bestResult: CompressionResult | null = null;

        for (let i = 0; i < passes.length; i++) {
          const { maxDim, quality } = passes[i];

          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context tidak tersedia.'));
            return;
          }

          // Clean white background behind transparent PNGs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to efficient JPEG data URL
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

          const padding = compressedBase64.endsWith('==') ? 2 : compressedBase64.endsWith('=') ? 1 : 0;
          const base64Length = compressedBase64.length - (compressedBase64.indexOf(',') + 1);
          const compressedSizeBytes = Math.round((base64Length * 3) / 4) - padding;

          bestResult = {
            base64: compressedBase64,
            originalSizeBytes,
            compressedSizeBytes,
            width,
            height
          };

          // Keep compressed payload <= 110KB for fast cellular upload & low Firestore read units
          if (compressedSizeBytes <= 110 * 1024) {
            break;
          }
        }

        if (bestResult) {
          resolve(bestResult);
        } else {
          reject(new Error('Gagal mengompresi gambar.'));
        }
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
