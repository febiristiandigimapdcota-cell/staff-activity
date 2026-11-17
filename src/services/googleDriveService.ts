/**
 * Direct Google Drive API & Apps Script Webhook Service for Staff Activity
 * Handles folder management, subfolder grouping (Open Studio, Try-On, Weekly Seed, Checklist),
 * and image uploads.
 */

export const DEFAULT_TARGET_FOLDER_ID = '1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB';
export const DEFAULT_TARGET_FOLDER_URL =
  'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link';

export const ROOT_FOLDER_NAME = 'Staff Activity - Bukti Toko';

export const ACTIVITY_SUBFOLDERS: Record<string, string> = {
  OPS: 'Open Studio',
  TryOn: 'Try On',
  TryOn_iPad: 'Try On',
  TryOn_AirPods: 'Try On',
  TryOn_Watch: 'Try On',
  WeeklySeed: 'Weekly Sales Coach',
  Checklist: 'Daily Checklist'
};

// Search keywords to match existing user folders regardless of exact casing or spaces
const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  OPS: ['open studio', 'openstudio', 'ops'],
  TryOn: ['try on', 'try-on', 'tryon'],
  TryOn_iPad: ['try on', 'try-on', 'tryon'],
  TryOn_AirPods: ['try on', 'try-on', 'tryon'],
  TryOn_Watch: ['try on', 'try-on', 'tryon'],
  WeeklySeed: ['weekly sales coach', 'sales coach', 'weekly seed', 'seed'],
  Checklist: ['daily checklist', 'checklist', 'ceklis']
};

export interface UploadResult {
  fileId: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  subfolderName?: string;
  subfolderId?: string;
}

// In-memory cache for folder IDs to reduce API latency
const subfolderCache: Record<string, { id: string; name: string; webViewLink?: string }> = {};

/**
 * Extracts Google Drive Folder ID from a URL or raw ID.
 */
export function extractFolderId(urlOrId?: string | null): string {
  if (!urlOrId) return DEFAULT_TARGET_FOLDER_ID;
  const trimmed = urlOrId.trim();
  if (trimmed.includes('/folders/')) {
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];
  }
  return trimmed || DEFAULT_TARGET_FOLDER_ID;
}

/**
 * Ensures the target root folder exists in the user's Google Drive.
 * Prioritizes the designated folder 1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB.
 */
export async function getOrCreateTargetFolder(
  accessToken: string,
  preferredFolderId?: string
): Promise<{ id: string; webViewLink?: string }> {
  const targetId = extractFolderId(preferredFolderId || DEFAULT_TARGET_FOLDER_ID);

  try {
    // 1. Verify if designated target folder ID is directly accessible
    const verifyUrl = `https://www.googleapis.com/drive/v3/files/${targetId}?fields=id,name,webViewLink,trashed`;
    const res = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (!data.trashed) {
        return {
          id: data.id,
          webViewLink: data.webViewLink || DEFAULT_TARGET_FOLDER_URL
        };
      }
    }
  } catch (err) {
    console.warn(`Direct verify for folder ${targetId} returned error:`, err);
  }

  try {
    // 2. Search for existing root folder by name
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&fields=files(id,name,webViewLink)`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return {
          id: data.files[0].id,
          webViewLink: data.files[0].webViewLink
        };
      }
    }

    // 3. Folder does not exist, create it
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Folder penyimpanan otomatis foto screenshot kerja operasional toko dari Staff Activity'
      })
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Gagal membuat folder Google Drive: ${err}`);
    }

    const createdFolder = await createRes.json();
    return {
      id: createdFolder.id,
      webViewLink: createdFolder.webViewLink
    };
  } catch (error) {
    console.error('getOrCreateTargetFolder error:', error);
    // Fallback to designated target folder ID
    return {
      id: DEFAULT_TARGET_FOLDER_ID,
      webViewLink: DEFAULT_TARGET_FOLDER_URL
    };
  }
}

/**
 * Gets or matches existing subfolder inside the target folder based on activity type:
 * - OPS -> 'Open Studio' / 'open studio'
 * - TryOn -> 'Try On' / 'try on'
 * - WeeklySeed -> 'Weekly Sales Coach' / 'weekly sales coach'
 * - Checklist -> 'Daily Checklist' / 'checklist'
 *
 * Case-insensitive search finds whatever folders already exist inside the folder.
 */
export async function getOrCreateActivitySubfolder(
  accessToken: string,
  parentFolderId: string,
  activityType: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const cleanParentId = extractFolderId(parentFolderId);
  const standardName = ACTIVITY_SUBFOLDERS[activityType] || 'Open Studio';
  const cacheKey = `${cleanParentId}_${activityType}`;

  if (subfolderCache[cacheKey]) {
    return subfolderCache[cacheKey];
  }

  const keywords = ACTIVITY_KEYWORDS[activityType] || [standardName.toLowerCase()];

  try {
    // 1. Fetch all child folders inside the parent folder
    const listChildrenUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${cleanParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&fields=files(id,name,webViewLink)&pageSize=50`;

    const res = await fetch(listChildrenUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && Array.isArray(data.files) && data.files.length > 0) {
        // Find best match among existing folders
        for (const f of data.files) {
          const lowerName = (f.name || '').toLowerCase().trim();
          for (const kw of keywords) {
            if (lowerName === kw || lowerName.includes(kw)) {
              const matched = {
                id: f.id,
                name: f.name,
                webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`
              };
              subfolderCache[cacheKey] = matched;
              return matched;
            }
          }
        }
      }
    }

    // 2. Subfolder not found, create it with standard title inside parent folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: standardName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [cleanParentId],
        description: `Folder otomatis untuk screenshot kategori ${standardName}`
      })
    });

    if (createRes.ok) {
      const created = await createRes.json();
      const createdObj = {
        id: created.id,
        name: standardName,
        webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`
      };
      subfolderCache[cacheKey] = createdObj;
      return createdObj;
    }
  } catch (err) {
    console.warn(`Failed to match or create subfolder for ${activityType}:`, err);
  }

  // Fallback to parent folder if subfolder creation encounters an issue
  return {
    id: cleanParentId,
    name: standardName,
    webViewLink: `https://drive.google.com/drive/folders/${cleanParentId}`
  };
}

/**
 * Ensures all standard activity subfolders exist and returns their links.
 */
export async function ensureAllSubfolders(
  accessToken: string,
  parentFolderId: string
): Promise<Record<string, { id: string; name: string; link?: string }>> {
  const cleanParentId = extractFolderId(parentFolderId);
  const results: Record<string, { id: string; name: string; link?: string }> = {};

  for (const [key, name] of Object.entries(ACTIVITY_SUBFOLDERS)) {
    try {
      const sub = await getOrCreateActivitySubfolder(accessToken, cleanParentId, key);
      results[key] = {
        id: sub.id,
        name: sub.name || name,
        link: sub.webViewLink || `https://drive.google.com/drive/folders/${sub.id}`
      };
    } catch {
      results[key] = {
        id: cleanParentId,
        name,
        link: `https://drive.google.com/drive/folders/${cleanParentId}`
      };
    }
  }

  return results;
}


/**
 * Uploads an image directly to the appropriate Google Drive subfolder via multipart upload.
 */
export async function uploadImageToDrive(params: {
  filename: string;
  mimeType: string;
  base64Data: string;
  staffName: string;
  activityType: string;
  note?: string;
  accessToken: string;
  folderId?: string;
}): Promise<UploadResult> {
  const { filename, mimeType, base64Data, staffName, activityType, note, accessToken, folderId } = params;

  // Clean base64 string
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  // Determine subfolder destination (defaults to user's folder 1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB)
  let parentRootId = extractFolderId(folderId || DEFAULT_TARGET_FOLDER_ID);
  let destinationFolderId = parentRootId;
  let subfolderName = ACTIVITY_SUBFOLDERS[activityType] || 'Open Studio';
  let subfolderId: string | undefined = undefined;

  try {
    const sub = await getOrCreateActivitySubfolder(accessToken, parentRootId, activityType);
    destinationFolderId = sub.id;
    subfolderName = sub.name;
    subfolderId = sub.id;
  } catch (subErr) {
    console.warn('Subfolder lookup failed, falling back to root folder:', subErr);
  }

  // File metadata for Drive
  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: mimeType || 'image/png',
    description: `Staf: ${staffName} | Kategori: ${subfolderName}${note ? ` | Catatan: ${note}` : ''}`
  };

  if (destinationFolderId) {
    metadata.parents = [destinationFolderId];
  }

  // Construct multipart/related request body
  const boundary = '-------StaffActivityBoundary' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType || 'image/png'}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    cleanBase64 +
    closeDelimiter;

  const uploadUrl =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink';

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: metaPart
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload ke Google Drive gagal: HTTP ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    fileId: result.id,
    name: result.name,
    webViewLink: result.webViewLink,
    webContentLink: result.webContentLink,
    subfolderName,
    subfolderId
  };
}

/**
 * Uploads an image via Google Apps Script Web App Endpoint.
 * Automatically delegates grouping to the Apps Script subfolders.
 */
export async function uploadImageViaAppsScript(params: {
  scriptUrl: string;
  folderUrlOrId: string;
  filename: string;
  mimeType: string;
  base64Data: string;
  staffName: string;
  activityType: string;
  note?: string;
}): Promise<{ success: boolean; fileId?: string; webViewLink?: string; message: string; subfolderName?: string }> {
  const { scriptUrl, folderUrlOrId, filename, mimeType, base64Data, staffName, activityType, note } = params;

  if (!scriptUrl || scriptUrl.trim().length === 0) {
    return { success: false, message: 'URL Web App Google Apps Script belum diisi.' };
  }

  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const targetSubfolder = ACTIVITY_SUBFOLDERS[activityType] || 'Open Studio';

  const payload = {
    action: 'uploadPhotoOnly',
    filename,
    mimeType: mimeType || 'image/jpeg',
    base64: cleanBase64,
    staffName,
    activityType,
    note: note || '',
    folderId: extractFolderId(folderUrlOrId),
    folderUrl: folderUrlOrId,
    subfolderName: targetSubfolder
  };

  try {
    // Use text/plain to avoid CORS preflight OPTIONS while still reading Apps Script JSON response
    const res = await fetch(scriptUrl.trim(), {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json && json.result === 'error') {
      return {
        success: false,
        message: json.message || 'Google Apps Script mengembalikan error saat upload.'
      };
    }

    return {
      success: true,
      fileId: json?.fileId,
      webViewLink: json?.url || json?.webViewLink,
      message: `Foto berhasil tersimpan di Google Drive subfolder '${json?.subfolder || targetSubfolder}'!`,
      subfolderName: json?.subfolder || targetSubfolder
    };
  } catch (error) {
    console.error('Apps Script Webhook Error:', error);
    return {
      success: false,
      message: 'Gagal menghubungi Web App Google Apps Script: ' + String(error)
    };
  }
}

/**
 * Sends a lightweight test image to Google Drive to confirm the connection and folder creation.
 */
export async function sendTestFileToDrive(options: {
  accessToken?: string | null;
  folderId?: string | null;
  appsScriptUrl?: string | null;
  folderUrlOrId?: string | null;
}): Promise<{ success: boolean; method: string; link?: string; message: string; subfolder?: string }> {
  // 1x1 transparent PNG data URL
  const testBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testFilename = `TEST_Koneksi_Drive_${Date.now()}.png`;

  // 1. Test via Access Token (Direct OAuth)
  if (options.accessToken) {
    try {
      let folderId = options.folderId;
      if (!folderId) {
        const folder = await getOrCreateTargetFolder(options.accessToken);
        folderId = folder.id;
      }
      const res = await uploadImageToDrive({
        filename: testFilename,
        mimeType: 'image/png',
        base64Data: testBase64,
        staffName: 'Admin Toko',
        activityType: 'OPS',
        note: 'Uji Coba Koneksi Google Drive Subfolder',
        accessToken: options.accessToken,
        folderId: folderId
      });
      return {
        success: true,
        method: 'Direct Google Drive API',
        link: res.webViewLink,
        subfolder: res.subfolderName,
        message: `Koneksi Berhasil! File tes otomatis tersimpan di subfolder '${res.subfolderName}'.`
      };
    } catch (err: unknown) {
      console.warn('OAuth test failed:', err);
    }
  }

  // 2. Test via Apps Script Webhook
  if (options.appsScriptUrl && options.appsScriptUrl.trim().length > 0) {
    const appsScriptRes = await uploadImageViaAppsScript({
      scriptUrl: options.appsScriptUrl,
      folderUrlOrId: options.folderUrlOrId || '',
      filename: testFilename,
      mimeType: 'image/png',
      base64Data: testBase64,
      staffName: 'Admin Toko',
      activityType: 'OPS',
      note: 'Uji Coba Webhook Google Drive Subfolder'
    });

    if (appsScriptRes.success) {
      return {
        success: true,
        method: 'Google Apps Script Webhook',
        subfolder: appsScriptRes.subfolderName,
        message: `Koneksi Webhook Berhasil! Permintaan upload berhasil terkirim dan diarahkan ke subfolder '${appsScriptRes.subfolderName}'.`
      };
    }
  }

  return {
    success: false,
    method: 'None',
    message: 'Belum ada koneksi Google Drive yang aktif. Hubungkan Google Drive atau pasang Webhook Apps Script.'
  };
}
