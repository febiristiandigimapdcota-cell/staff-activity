import { StaffMember, AppConfig } from '../types';

export const STORE_TRYON_WEEKLY_TARGET = 42;
export const STORE_OPS_MONTHLY_TARGET = 81;
export const STORE_TRYON_MONTHLY_TARGET = 190;

export const DAYS_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export const DUMMY_STAFF_NAMES = [
  'adit prasetyo',
  'rina marlina',
  'rina marliana',
  'siti kurnia',
  'budi santoso',
  'lia lestari'
];

export function isDummyStaffMember(name?: string): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase();
  return DUMMY_STAFF_NAMES.some((dummy) => clean.includes(dummy));
}

export function isDummyStaffRoster(list?: StaffMember[]): boolean {
  if (!list || list.length === 0) return false;
  const dummyCount = list.filter((s) => isDummyStaffMember(s.name)).length;
  // If majority or all match the initial dummy example names
  return dummyCount >= Math.min(2, list.length);
}

// Default initial staff is strictly EMPTY (no dummy staff like Rina Marlina)
export const INITIAL_STAFF_DATA: StaffMember[] = [];

export const INITIAL_APP_CONFIG: AppConfig = {
  adminPin: 'admin',
  adminDriveUrl: 'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link',
  adminDriveScriptUrl: (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_APPS_SCRIPT_URL) || '',
  adminDriveFolderId: '1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB',
  adminDriveFolderLink: 'https://drive.google.com/drive/folders/1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB?usp=share_link'
};

export const QUICK_OPERATIONAL_LINKS = [
  {
    id: 'ops-form',
    title: 'Link Open Studio',
    subtitle: 'Google Form Penugasan OPS',
    url: 'https://forms.gle/KxWcLXytpqkJJNDc9',
    badge: 'OPS Sesi',
    type: 'OPS',
    color: 'from-blue-600 to-indigo-600'
  },
  {
    id: 'tryon-aksara',
    title: 'Link Try On Aksara',
    subtitle: 'Form Pendataan Try-On Aksara',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSckv5jybuadbmja0zvLqJXvWLPufpTUOCHrkLrU-3Ho9nZDJA/viewform',
    badge: 'Try-On Store',
    type: 'TryOn',
    color: 'from-zinc-800 to-zinc-950'
  },
  {
    id: 'tryon-airpods',
    title: 'Link Airpods Try On',
    subtitle: 'Form Pendataan Try-On AirPods',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSdDj3fPWA5_tZ7xBcjEhb8hMn0DAQ5Ok_joASUjwStYUjC5Ow/viewform',
    badge: 'Audio Demo',
    type: 'TryOn',
    color: 'from-emerald-600 to-teal-700'
  },
  {
    id: 'daily-ceklis',
    title: 'Dailyceklis M131',
    subtitle: 'Checklist Operasional Harian Toko',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfa7qAEatFlNJbZQfc733a_h4iqeaIKWlAGGWmE2WwVRwT3jA/viewform?usp=publish-editor',
    badge: 'SOP Harian',
    type: 'Checklist',
    color: 'from-amber-600 to-orange-700'
  },
  {
    id: 'sales-coach',
    title: 'Monthly Sales Coach',
    subtitle: 'Form Submit Coaching Sales Bulanan',
    url: 'https://ztevejob.github.io/Sales-Coach-Submit/',
    badge: 'Coaching',
    type: 'WeeklySeed',
    color: 'from-purple-600 to-indigo-700'
  }
];

export const APPS_SCRIPT_SNIPPET = `/**
 * ACTIVITY OS - FULL GOOGLE DRIVE STORAGE BACKEND (Apps Script Web App)
 * Menyimpan SELURUH database aplikasi (Schedule, Target Staf, EMS, Training HO, Config)
 * DAN seluruh file foto bukti ke dalam subfolder Google Drive secara terstruktur.
 */

var DEFAULT_FOLDER_ID = "1k274pmYI5tvjYyyY6KwRqkTghZl8TpUB";
var DB_FOLDER_NAME = "_Database_ActivityOS";
var DB_FILE_NAME = "activity_os_db.json";
var PHOTOS_FILE_NAME = "activity_os_photos.json";

/**
 * JALANKAN FUNGSI INI 1x DI EDITOR APPS SCRIPT (Pilih "izinDrive" -> Klik "Run")
 * untuk memunculkan popup otorisasi Google Drive dan memastikan folder dapat diakses.
 */
function izinDrive() {
  var myRoot = DriveApp.getRootFolder();
  Logger.log("My Drive OK: " + myRoot.getName());
  var resolved = getRootAndDbFolder(DEFAULT_FOLDER_ID);
  Logger.log("Folder Aktif: " + resolved.rootFolder.getName() + " (" + resolved.rootFolder.getUrl() + ")");
  if (resolved.usedFallback) {
    Logger.log("Catatan Fallback: " + resolved.fallbackReason);
  }
  return "SUKSES: Izin DriveApp aktif -> " + resolved.rootFolder.getName();
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractFolderId(val) {
  if (!val) return DEFAULT_FOLDER_ID;
  var s = String(val).trim();
  var match = s.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return s || DEFAULT_FOLDER_ID;
}

function ensureOwnStorageFolder() {
  var myRoot = DriveApp.getRootFolder();
  return getOrCreateChildFolder(myRoot, "Activity OS - Storage Toko", ["activity os - storage toko", "staff activity - bukti toko"]);
}

function getRootAndDbFolder(folderIdParam) {
  try {
    DriveApp.getRootFolder().getName();
  } catch (authErr) {
    throw new Error(
      "Akses DriveApp ditolak (" + authErr.toString() + "). " +
      "Cek 3 hal ini: (1) Di Deploy > Web app, 'Execute as / Jalankan sebagai' WAJIB 'Me (Saya)', bukan 'User accessing the web app'; " +
      "(2) Pilih fungsi 'izinDrive' di editor Apps Script lalu klik Run > Advanced > Centang semua kotak izin Google Drive > Allow; " +
      "(3) Jika Chrome login banyak akun Google, buka lewat Mode Incognito dengan 1 akun Google."
    );
  }

  var fid = extractFolderId(folderIdParam);
  try {
    var target = DriveApp.getFolderById(fid);
    var dbF = getOrCreateDbFolder(target);
    return { rootFolder: target, dbFolder: dbF, usedFallback: false, fallbackReason: "" };
  } catch (folderErr) {
    var ownFolder = ensureOwnStorageFolder();
    var ownDb = getOrCreateDbFolder(ownFolder);
    return {
      rootFolder: ownFolder,
      dbFolder: ownDb,
      usedFallback: true,
      fallbackReason: "Folder ID (" + fid + ") tidak memiliki akses Editor untuk akun ini, otomatis menggunakan folder My Drive Anda: " + ownFolder.getName()
    };
  }
}

function getRootFolder(folderIdParam) {
  return getRootAndDbFolder(folderIdParam).rootFolder;
}

function getOrCreateChildFolder(parent, name, searchTerms) {
  var folders = parent.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    var lower = f.getName().toLowerCase().trim();
    if (lower === name.toLowerCase()) return f;
    if (searchTerms && searchTerms.length) {
      for (var i = 0; i < searchTerms.length; i++) {
        if (lower.indexOf(searchTerms[i]) > -1) return f;
      }
    }
  }
  return parent.createFolder(name);
}

function getSubfolderForActivity(rootFolder, activityType) {
  var t = String(activityType || "OPS");
  if (t.indexOf("TryOn") === 0) {
    return getOrCreateChildFolder(rootFolder, "Try On", ["try on", "try-on", "tryon"]);
  }
  if (t === "WeeklySeed") {
    return getOrCreateChildFolder(rootFolder, "Weekly Sales Coach", ["weekly sales coach", "sales coach", "weekly seed"]);
  }
  if (t === "Checklist") {
    return getOrCreateChildFolder(rootFolder, "Daily Checklist", ["daily checklist", "checklist", "ceklis"]);
  }
  return getOrCreateChildFolder(rootFolder, "Open Studio", ["open studio", "openstudio", "ops"]);
}

function getOrCreateDbFolder(rootFolder) {
  return getOrCreateChildFolder(rootFolder, DB_FOLDER_NAME, ["_database_activityos"]);
}

function readJsonFile(folder, fileName, fallbackObj) {
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    try {
      var content = file.getBlob().getDataAsString("UTF-8");
      if (content && content.trim().length > 0) {
        return { file: file, data: JSON.parse(content) };
      }
    } catch (e) {}
    return { file: file, data: fallbackObj };
  }
  var created = folder.createFile(fileName, JSON.stringify(fallbackObj), MimeType.PLAIN_TEXT);
  return { file: created, data: fallbackObj };
}

function writeJsonFile(file, data) {
  file.setContent(JSON.stringify(data));
}

function getDefaultDb() {
  var nowIso = new Date().toISOString();
  return {
    staffList: [],
    scheduleMeta: { fileName: "", uploadedAt: "", updatedAt: "", isUsingPrevious: false },
    emsSchedule: null,
    trainingHo: null,
    staffStatsArchive: {},
    scheduleHistory: [],
    config: {
      adminPin: "admin",
      adminDriveFolderId: DEFAULT_FOLDER_ID
    },
    syncMeta: {
      lastScheduleUpdatedAt: "",
      lastPhotoId: 0,
      lastPhotoUpdatedAt: "",
      lastEmsUpdatedAt: "",
      lastTrainingHoUpdatedAt: "",
      lastTargetResetAt: "",
      targetMonthKey: getMonthKey(new Date()),
      scheduleFileName: "",
      resetNonce: "",
      updatedAt: nowIso
    }
  };
}

function getMonthKey(d) {
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  return y + "-" + (m < 10 ? "0" + m : "" + m);
}

function normalizeKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\\s+/g, " ");
}

function isTryOn(t) {
  return String(t || "").indexOf("TryOn") === 0;
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || "sync";
    var resolvedGet = getRootAndDbFolder(p.folderId);
    var rootFolder = resolvedGet.rootFolder;

    if (action === "getImage") {
      var fileId = p.fileId;
      if (!fileId) return jsonOut({ result: "error", message: "fileId kosong" });
      var f = DriveApp.getFileById(fileId);
      var blob = f.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      return jsonOut({
        result: "success",
        fileId: fileId,
        mimeType: blob.getContentType(),
        dataUrl: "data:" + blob.getContentType() + ";base64," + b64
      });
    }

    var dbFolder = resolvedGet.dbFolder;
    var dbWrap = readJsonFile(dbFolder, DB_FILE_NAME, getDefaultDb());
    var db = dbWrap.data || getDefaultDb();
    if (!db.syncMeta) db.syncMeta = getDefaultDb().syncMeta;

    if (action === "ping") {
      var photosWrapPing = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var opsFolder = getSubfolderForActivity(rootFolder, "OPS");
      var tryOnFolder = getSubfolderForActivity(rootFolder, "TryOn");
      var seedFolder = getSubfolderForActivity(rootFolder, "WeeklySeed");
      var chkFolder = getSubfolderForActivity(rootFolder, "Checklist");
      return jsonOut({
        result: "success",
        message: resolvedGet.usedFallback
          ? ("Terhubung! " + resolvedGet.fallbackReason)
          : "Koneksi Google Drive & Apps Script Aktif!",
        usedFallback: resolvedGet.usedFallback,
        rootFolderId: rootFolder.getId(),
        rootFolderName: rootFolder.getName(),
        rootFolderUrl: rootFolder.getUrl(),
        dbFileId: dbWrap.file.getId(),
        photosFileId: photosWrapPing.file.getId(),
        staffCount: (db.staffList || []).length,
        photoCount: (photosWrapPing.data || []).length,
        subfolderLinks: {
          OPS: opsFolder.getUrl(),
          TryOn: tryOnFolder.getUrl(),
          WeeklySeed: seedFolder.getUrl(),
          Checklist: chkFolder.getUrl()
        }
      });
    }

    if (action === "sync") {
      var knownMaxPhotoId = Number(p.knownMaxPhotoId || 0);
      var knownScheduleUpdatedAt = String(p.knownScheduleUpdatedAt || "");
      var knownResetNonce = String(p.knownResetNonce || "");
      var forceFull = String(p.forceFull || "") === "true";
      var sm = db.syncMeta;

      if (sm.resetNonce && knownResetNonce && sm.resetNonce !== knownResetNonce) {
        return jsonOut({
          result: "success",
          resetDetected: true,
          nothingNew: false,
          syncMeta: sm,
          config: db.config || null
        });
      }

      var needSched = forceFull || !knownScheduleUpdatedAt || (sm.lastScheduleUpdatedAt && sm.lastScheduleUpdatedAt !== knownScheduleUpdatedAt);
      var needPhotos = forceFull || knownMaxPhotoId === 0 || Number(sm.lastPhotoId || 0) > knownMaxPhotoId;
      var needEms = forceFull || (sm.lastEmsUpdatedAt && sm.lastEmsUpdatedAt !== String(p.knownEmsUpdatedAt || ""));
      var needTraining = forceFull || (sm.lastTrainingHoUpdatedAt && sm.lastTrainingHoUpdatedAt !== String(p.knownTrainingHoUpdatedAt || ""));

      if (!needSched && !needPhotos && !needEms && !needTraining) {
        return jsonOut({
          result: "success",
          resetDetected: false,
          nothingNew: true,
          syncMeta: sm,
          config: db.config || null
        });
      }

      var newPhotos = [];
      var isFullPhotoList = false;
      if (needPhotos) {
        var photosWrap = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
        var allPhotos = Array.isArray(photosWrap.data) ? photosWrap.data : [];
        if (forceFull || knownMaxPhotoId === 0) {
          newPhotos = allPhotos;
          isFullPhotoList = true;
        } else {
          for (var i = 0; i < allPhotos.length; i++) {
            if (Number(allPhotos[i].id || 0) > knownMaxPhotoId) {
              newPhotos.push(allPhotos[i]);
            }
          }
        }
      }

      return jsonOut({
        result: "success",
        resetDetected: false,
        nothingNew: false,
        staffList: needSched ? (db.staffList || []) : null,
        scheduleMeta: needSched ? (db.scheduleMeta || null) : null,
        emsSchedule: (needSched || needEms) ? (db.emsSchedule || null) : null,
        trainingHo: (needSched || needTraining) ? (db.trainingHo || null) : null,
        newPhotos: newPhotos,
        isFullPhotoList: isFullPhotoList,
        config: db.config || null,
        syncMeta: sm
      });
    }

    // Default getAll
    var allPhotosWrap = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
    return jsonOut({
      result: "success",
      staffList: db.staffList || [],
      scheduleMeta: db.scheduleMeta || null,
      emsSchedule: db.emsSchedule || null,
      trainingHo: db.trainingHo || null,
      photos: Array.isArray(allPhotosWrap.data) ? allPhotosWrap.data : [],
      config: db.config || null,
      syncMeta: db.syncMeta
    });
  } catch (err) {
    return jsonOut({ result: "error", message: err.toString() });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "uploadPhotoOnly";
    var resolvedPost = getRootAndDbFolder(data.folderId || data.folderUrl);
    var rootFolder = resolvedPost.rootFolder;

    // Legacy / standalone photo upload
    if (action === "uploadPhotoOnly") {
      var sub = getSubfolderForActivity(rootFolder, data.activityType);
      var decoded = Utilities.base64Decode(data.base64);
      var blob = Utilities.newBlob(decoded, data.mimeType || "image/jpeg", data.filename || ("bukti_" + Date.now() + ".jpg"));
      var file = sub.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (se) {}
      var desc = "Staf: " + (data.staffName || "-") + " | Kategori: " + sub.getName();
      if (data.note) desc += " | Catatan: " + data.note;
      file.setDescription(desc);
      return jsonOut({
        result: "success",
        fileId: file.getId(),
        url: file.getUrl(),
        webViewLink: file.getUrl(),
        subfolder: sub.getName(),
        rootFolderUrl: rootFolder.getUrl()
      });
    }

    var dbFolder = resolvedPost.dbFolder;
    var dbWrap = readJsonFile(dbFolder, DB_FILE_NAME, getDefaultDb());
    var db = dbWrap.data || getDefaultDb();
    if (!db.syncMeta) db.syncMeta = getDefaultDb().syncMeta;
    if (!db.staffStatsArchive) db.staffStatsArchive = {};
    var now = new Date();
    var nowIso = now.toISOString();
    var monthKey = getMonthKey(now);

    if (action === "init") {
      var photosInit = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var opsF = getSubfolderForActivity(rootFolder, "OPS");
      var tryF = getSubfolderForActivity(rootFolder, "TryOn");
      var seedF = getSubfolderForActivity(rootFolder, "WeeklySeed");
      var chkF = getSubfolderForActivity(rootFolder, "Checklist");
      writeJsonFile(dbWrap.file, db);
      return jsonOut({
        result: "success",
        message: resolvedPost.usedFallback
          ? ("Terhubung! " + resolvedPost.fallbackReason)
          : ("Terhubung ke Google Drive \"" + rootFolder.getName() + "\"! Database JSON & 4 subfolder bukti siap digunakan."),
        usedFallback: resolvedPost.usedFallback,
        rootFolderId: rootFolder.getId(),
        rootFolderName: rootFolder.getName(),
        rootFolderUrl: rootFolder.getUrl(),
        dbFileId: dbWrap.file.getId(),
        photosFileId: photosInit.file.getId(),
        staffCount: (db.staffList || []).length,
        photoCount: (photosInit.data || []).length,
        subfolderLinks: {
          OPS: opsF.getUrl(),
          TryOn: tryF.getUrl(),
          WeeklySeed: seedF.getUrl(),
          Checklist: chkF.getUrl()
        }
      });
    }

    if (action === "savePhoto") {
      var photosWrap = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var photos = Array.isArray(photosWrap.data) ? photosWrap.data : [];
      var photoRec = data.photo || {};
      var fileId = photoRec.driveFileId || "";
      var webViewLink = photoRec.driveWebViewLink || "";

      if (data.base64) {
        var subFolder = getSubfolderForActivity(rootFolder, photoRec.activityType || "OPS");
        var decodedBytes = Utilities.base64Decode(data.base64);
        var imgBlob = Utilities.newBlob(
          decodedBytes,
          data.mimeType || "image/jpeg",
          data.filename || ((photoRec.activityType || "OPS") + "_" + (photoRec.staffName || "Staf") + "_" + Date.now() + ".jpg")
        );
        var driveFile = subFolder.createFile(imgBlob);
        try { driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (shareErr) {}
        var fileDesc = "Staf: " + (photoRec.staffName || "-") + " | Kategori: " + subFolder.getName();
        if (photoRec.note) fileDesc += " | Catatan: " + photoRec.note;
        driveFile.setDescription(fileDesc);
        fileId = driveFile.getId();
        webViewLink = driveFile.getUrl();
      }

      var savedPhoto = {
        id: Number(photoRec.id) || Date.now(),
        staffName: photoRec.staffName || "Staf Toko",
        activityType: photoRec.activityType || "OPS",
        note: photoRec.note || "",
        photoUrl: fileId ? ("https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000") : (photoRec.photoUrl || ""),
        timestamp: photoRec.timestamp || "",
        syncedToDrive: Boolean(fileId),
        driveFileId: fileId,
        driveWebViewLink: webViewLink,
        customerType: photoRec.customerType || undefined,
        programCampaign: photoRec.programCampaign || undefined
      };

      photos.unshift(savedPhoto);
      writeJsonFile(photosWrap.file, photos);

      if (data.updateTarget !== false) {
        applyTargetIncrement(db, data.staffId, savedPhoto.staffName, savedPhoto.activityType, 1, data.targetResetAt || db.syncMeta.lastTargetResetAt || "", monthKey, nowIso);
      }

      db.syncMeta.lastPhotoId = Math.max(Number(db.syncMeta.lastPhotoId || 0), savedPhoto.id);
      db.syncMeta.lastPhotoUpdatedAt = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);

      return jsonOut({
        result: "success",
        photo: savedPhoto,
        staffList: db.staffList || [],
        syncMeta: db.syncMeta
      });
    }

    if (action === "deletePhoto") {
      var pWrapDel = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var pList = Array.isArray(pWrapDel.data) ? pWrapDel.data : [];
      var targetId = Number(data.photoId);
      var remaining = [];
      for (var di = 0; di < pList.length; di++) {
        if (Number(pList[di].id) === targetId) {
          if (pList[di].driveFileId) {
            try { DriveApp.getFileById(pList[di].driveFileId).setTrashed(true); } catch (te) {}
          }
        } else {
          remaining.push(pList[di]);
        }
      }
      writeJsonFile(pWrapDel.file, remaining);
      db.syncMeta.lastPhotoUpdatedAt = nowIso;
      db.syncMeta.resetNonce = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", photos: remaining, syncMeta: db.syncMeta });
    }

    if (action === "incrementTarget") {
      applyTargetIncrement(db, data.staffId, data.staffName || "", data.activityType, Number(data.count || 1), data.targetResetAt || db.syncMeta.lastTargetResetAt || "", monthKey, nowIso);
      db.syncMeta.lastScheduleUpdatedAt = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", staffList: db.staffList || [], syncMeta: db.syncMeta });
    }

    if (action === "saveSchedule") {
      var incomingStaff = Array.isArray(data.staffList) ? data.staffList : [];
      var meta = data.meta || {};
      var resetWeekly = data.resetWeeklyTargets !== false;
      var effectiveResetAt = data.targetResetAt || db.syncMeta.lastTargetResetAt || "";

      if (Array.isArray(db.staffList) && db.staffList.length > 0) {
        if (!Array.isArray(db.scheduleHistory)) db.scheduleHistory = [];
        db.scheduleHistory.unshift({ savedAt: nowIso, staffList: db.staffList });
        db.scheduleHistory = db.scheduleHistory.slice(0, 5);
        for (var oi = 0; oi < db.staffList.length; oi++) {
          var os = db.staffList[oi];
          var ok = normalizeKey(os.name);
          if (ok) {
            var sameM = (!os.monthKey || os.monthKey === monthKey) && (!effectiveResetAt || os.monthlyResetAt === effectiveResetAt);
            db.staffStatsArchive[ok] = {
              name: os.name,
              achOps: resetWeekly ? 0 : (Number(os.achOps) || 0),
              achTryOn: resetWeekly ? 0 : (Number(os.achTryOn) || 0),
              achWeeklySeed: resetWeekly ? 0 : (Number(os.achWeeklySeed) || 0),
              achChecklist: resetWeekly ? 0 : (Number(os.achChecklist) || 0),
              monthKey: monthKey,
              monthlyOps: sameM ? (Number(os.monthlyOps) || 0) : 0,
              monthlyTryOn: sameM ? (Number(os.monthlyTryOn) || 0) : 0,
              monthlyWeeklySeed: sameM ? (Number(os.monthlyWeeklySeed) || 0) : 0,
              monthlyChecklist: sameM ? (Number(os.monthlyChecklist) || 0) : 0,
              monthlyResetAt: effectiveResetAt || undefined,
              updatedAt: nowIso
            };
          }
        }
      }

      var reconciled = [];
      for (var si = 0; si < incomingStaff.length; si++) {
        var st = incomingStaff[si];
        var sk = normalizeKey(st.name);
        var arch = db.staffStatsArchive[sk] || {};
        var archSame = (!arch.monthKey || arch.monthKey === monthKey) && (!effectiveResetAt || arch.monthlyResetAt === effectiveResetAt);
        var stSame = (!st.monthKey || st.monthKey === monthKey) && (!effectiveResetAt || st.monthlyResetAt === effectiveResetAt);

        var achOps = resetWeekly ? 0 : (Number(st.achOps) || 0);
        var achTryOn = resetWeekly ? 0 : (Number(st.achTryOn) || 0);
        var achWeeklySeed = resetWeekly ? 0 : (Number(st.achWeeklySeed) || 0);
        var achChecklist = resetWeekly ? 0 : (Number(st.achChecklist) || 0);

        var mOps = Math.max(stSame ? (Number(st.monthlyOps) || 0) : 0, archSame ? (Number(arch.monthlyOps) || 0) : 0, achOps);
        var mTryOn = Math.max(stSame ? (Number(st.monthlyTryOn) || 0) : 0, archSame ? (Number(arch.monthlyTryOn) || 0) : 0, achTryOn);
        var mSeed = Math.max(stSame ? (Number(st.monthlyWeeklySeed) || 0) : 0, archSame ? (Number(arch.monthlyWeeklySeed) || 0) : 0, achWeeklySeed);
        var mChk = Math.max(stSame ? (Number(st.monthlyChecklist) || 0) : 0, archSame ? (Number(arch.monthlyChecklist) || 0) : 0, achChecklist);

        var item = {
          id: Number(st.id),
          name: st.name,
          role: st.role || "Specialist",
          shifts: Array.isArray(st.shifts) ? st.shifts : [],
          targetOps: Number(st.targetOps) || 0,
          targetTryOn: Number(st.targetTryOn) || 0,
          achOps: achOps,
          achTryOn: achTryOn,
          achWeeklySeed: achWeeklySeed,
          achChecklist: achChecklist,
          monthKey: monthKey,
          monthlyOps: mOps,
          monthlyTryOn: mTryOn,
          monthlyWeeklySeed: mSeed,
          monthlyChecklist: mChk,
          monthlyResetAt: effectiveResetAt || st.monthlyResetAt || ""
        };
        reconciled.push(item);
        if (sk) {
          db.staffStatsArchive[sk] = {
            name: st.name,
            achOps: achOps,
            achTryOn: achTryOn,
            achWeeklySeed: achWeeklySeed,
            achChecklist: achChecklist,
            monthKey: monthKey,
            monthlyOps: mOps,
            monthlyTryOn: mTryOn,
            monthlyWeeklySeed: mSeed,
            monthlyChecklist: mChk,
            monthlyResetAt: effectiveResetAt || undefined,
            updatedAt: nowIso
          };
        }
      }

      db.staffList = reconciled;
      db.scheduleMeta = {
        fileName: meta.fileName || "Schedule_Toko.xlsx",
        uploadedAt: meta.uploadedAt || nowIso,
        updatedAt: nowIso,
        isUsingPrevious: Boolean(meta.isUsingPrevious)
      };
      db.syncMeta.lastScheduleUpdatedAt = nowIso;
      db.syncMeta.scheduleFileName = db.scheduleMeta.fileName;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);

      return jsonOut({
        result: "success",
        staffList: reconciled,
        scheduleMeta: db.scheduleMeta,
        syncMeta: db.syncMeta
      });
    }

    if (action === "saveEms") {
      db.emsSchedule = data.emsSchedule || null;
      if (db.emsSchedule) db.emsSchedule.updatedAt = nowIso;
      db.syncMeta.lastEmsUpdatedAt = nowIso;
      db.syncMeta.lastScheduleUpdatedAt = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", emsSchedule: db.emsSchedule, syncMeta: db.syncMeta });
    }

    if (action === "saveTrainingHo") {
      db.trainingHo = data.trainingHo || null;
      if (db.trainingHo) db.trainingHo.updatedAt = nowIso;
      db.syncMeta.lastTrainingHoUpdatedAt = nowIso;
      db.syncMeta.lastScheduleUpdatedAt = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", trainingHo: db.trainingHo, syncMeta: db.syncMeta });
    }

    if (action === "saveConfig") {
      db.config = data.config || db.config || {};
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", config: db.config, syncMeta: db.syncMeta });
    }

    if (action === "resetTargets") {
      var list = Array.isArray(db.staffList) ? db.staffList : [];
      for (var ri = 0; ri < list.length; ri++) {
        list[ri].achOps = 0;
        list[ri].achTryOn = 0;
        list[ri].achWeeklySeed = 0;
        list[ri].achChecklist = 0;
        list[ri].monthKey = monthKey;
        list[ri].monthlyOps = 0;
        list[ri].monthlyTryOn = 0;
        list[ri].monthlyWeeklySeed = 0;
        list[ri].monthlyChecklist = 0;
        list[ri].monthlyResetAt = nowIso;
      }
      for (var ak in db.staffStatsArchive) {
        if (db.staffStatsArchive.hasOwnProperty(ak)) {
          db.staffStatsArchive[ak].achOps = 0;
          db.staffStatsArchive[ak].achTryOn = 0;
          db.staffStatsArchive[ak].achWeeklySeed = 0;
          db.staffStatsArchive[ak].achChecklist = 0;
          db.staffStatsArchive[ak].monthKey = monthKey;
          db.staffStatsArchive[ak].monthlyOps = 0;
          db.staffStatsArchive[ak].monthlyTryOn = 0;
          db.staffStatsArchive[ak].monthlyWeeklySeed = 0;
          db.staffStatsArchive[ak].monthlyChecklist = 0;
          db.staffStatsArchive[ak].monthlyResetAt = nowIso;
        }
      }
      db.staffList = list;
      db.syncMeta.lastTargetResetAt = nowIso;
      db.syncMeta.targetMonthKey = monthKey;
      db.syncMeta.lastScheduleUpdatedAt = nowIso;
      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", resetAt: nowIso, monthKey: monthKey, updatedStaff: list, syncMeta: db.syncMeta });
    }

    if (action === "restoreAndReconcile") {
      var pWrapRec = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var allP = Array.isArray(pWrapRec.data) ? pWrapRec.data : [];
      return jsonOut({
        result: "success",
        totalPhotosFound: allP.length,
        staffRestoredCount: (db.staffList || []).length,
        recoveredRosterFromBackup: false,
        restoredStaffList: db.staffList || [],
        restoredPhotos: allP
      });
    }

    if (action === "clearAll") {
      var pWrapClr = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var oldPhotos = Array.isArray(pWrapClr.data) ? pWrapClr.data : [];
      var oldStaff = Array.isArray(db.staffList) ? db.staffList : [];
      writeJsonFile(pWrapClr.file, []);
      db.staffList = [];
      db.scheduleMeta = { fileName: "", uploadedAt: "", updatedAt: nowIso, isUsingPrevious: false };
      db.emsSchedule = null;
      db.trainingHo = null;
      db.staffStatsArchive = {};
      db.scheduleHistory = [];
      db.syncMeta = {
        lastScheduleUpdatedAt: nowIso,
        lastPhotoId: 0,
        lastPhotoUpdatedAt: nowIso,
        lastEmsUpdatedAt: nowIso,
        lastTrainingHoUpdatedAt: nowIso,
        lastTargetResetAt: nowIso,
        targetMonthKey: monthKey,
        scheduleFileName: "",
        resetNonce: nowIso,
        updatedAt: nowIso
      };
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", deletedPhotos: oldPhotos.length, deletedStaff: oldStaff.length, syncMeta: db.syncMeta });
    }

    if (action === "migrateBatch") {
      if (Array.isArray(data.staffList) && data.staffList.length > 0) {
        db.staffList = data.staffList;
        db.syncMeta.lastScheduleUpdatedAt = nowIso;
      }
      if (data.scheduleMeta) db.scheduleMeta = data.scheduleMeta;
      if (data.emsSchedule) { db.emsSchedule = data.emsSchedule; db.syncMeta.lastEmsUpdatedAt = nowIso; }
      if (data.trainingHo) { db.trainingHo = data.trainingHo; db.syncMeta.lastTrainingHoUpdatedAt = nowIso; }
      if (data.config) db.config = data.config;

      var pWrapMig = readJsonFile(dbFolder, PHOTOS_FILE_NAME, []);
      var curPhotos = Array.isArray(pWrapMig.data) ? pWrapMig.data : [];
      var existingIds = {};
      for (var ei = 0; ei < curPhotos.length; ei++) existingIds[String(curPhotos[ei].id)] = true;

      if (Array.isArray(data.photos)) {
        for (var pi = 0; pi < data.photos.length; pi++) {
          var ph = data.photos[pi];
          if (existingIds[String(ph.id)]) continue;
          var migFileId = ph.driveFileId || "";
          var migWebLink = ph.driveWebViewLink || "";
          if (!migFileId && ph.photoUrl && ph.photoUrl.indexOf("data:") === 0) {
            var b64Part = ph.photoUrl.split(",")[1];
            var mimeMatch = ph.photoUrl.match(/^data:([^;]+);/);
            var mimeT = mimeMatch ? mimeMatch[1] : "image/jpeg";
            var subMig = getSubfolderForActivity(rootFolder, ph.activityType || "OPS");
            var decMig = Utilities.base64Decode(b64Part);
            var blobMig = Utilities.newBlob(decMig, mimeT, (ph.activityType || "OPS") + "_" + (ph.staffName || "Staf") + "_" + ph.id + ".jpg");
            var fMig = subMig.createFile(blobMig);
            try { fMig.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (me) {}
            migFileId = fMig.getId();
            migWebLink = fMig.getUrl();
          }
          curPhotos.push({
            id: Number(ph.id) || Date.now(),
            staffName: ph.staffName || "Staf Toko",
            activityType: ph.activityType || "OPS",
            note: ph.note || "",
            photoUrl: migFileId ? ("https://drive.google.com/thumbnail?id=" + migFileId + "&sz=w1000") : (ph.photoUrl || ""),
            timestamp: ph.timestamp || "",
            syncedToDrive: Boolean(migFileId),
            driveFileId: migFileId,
            driveWebViewLink: migWebLink,
            customerType: ph.customerType || undefined,
            programCampaign: ph.programCampaign || undefined
          });
          db.syncMeta.lastPhotoId = Math.max(Number(db.syncMeta.lastPhotoId || 0), Number(ph.id || 0));
        }
        curPhotos.sort(function(a, b) { return Number(b.id) - Number(a.id); });
        writeJsonFile(pWrapMig.file, curPhotos);
        db.syncMeta.lastPhotoUpdatedAt = nowIso;
      }

      db.syncMeta.updatedAt = nowIso;
      writeJsonFile(dbWrap.file, db);
      return jsonOut({ result: "success", staffList: db.staffList, photos: curPhotos, syncMeta: db.syncMeta });
    }

    return jsonOut({ result: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonOut({ result: "error", message: err.toString() });
  } finally {
    try { lock.releaseLock(); } catch (le) {}
  }
}

function applyTargetIncrement(db, staffId, staffName, activityType, count, targetResetAt, monthKey, nowIso) {
  var list = Array.isArray(db.staffList) ? db.staffList : [];
  var targetIdx = -1;
  for (var i = 0; i < list.length; i++) {
    if ((staffId && Number(list[i].id) === Number(staffId)) || (staffName && normalizeKey(list[i].name) === normalizeKey(staffName))) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) return;

  var s = list[targetIdx];
  var sameCycle = s.monthKey === monthKey && (!targetResetAt || s.monthlyResetAt === targetResetAt);
  if (!sameCycle) {
    s.monthlyOps = 0;
    s.monthlyTryOn = 0;
    s.monthlyWeeklySeed = 0;
    s.monthlyChecklist = 0;
  }
  s.monthKey = monthKey;
  if (targetResetAt) s.monthlyResetAt = targetResetAt;

  if (activityType === "OPS") {
    s.achOps = (Number(s.achOps) || 0) + count;
    s.monthlyOps = (Number(s.monthlyOps) || 0) + count;
  } else if (isTryOn(activityType)) {
    s.achTryOn = (Number(s.achTryOn) || 0) + count;
    s.monthlyTryOn = (Number(s.monthlyTryOn) || 0) + count;
  } else if (activityType === "WeeklySeed") {
    s.achWeeklySeed = (Number(s.achWeeklySeed) || 0) + count;
    s.monthlyWeeklySeed = (Number(s.monthlyWeeklySeed) || 0) + count;
  } else if (activityType === "Checklist") {
    s.achChecklist = (Number(s.achChecklist) || 0) + count;
    s.monthlyChecklist = (Number(s.monthlyChecklist) || 0) + count;
  }

  list[targetIdx] = s;
  db.staffList = list;
  var sk = normalizeKey(s.name);
  if (sk) {
    db.staffStatsArchive[sk] = {
      name: s.name,
      achOps: s.achOps || 0,
      achTryOn: s.achTryOn || 0,
      achWeeklySeed: s.achWeeklySeed || 0,
      achChecklist: s.achChecklist || 0,
      monthKey: monthKey,
      monthlyOps: s.monthlyOps || 0,
      monthlyTryOn: s.monthlyTryOn || 0,
      monthlyWeeklySeed: s.monthlyWeeklySeed || 0,
      monthlyChecklist: s.monthlyChecklist || 0,
      monthlyResetAt: s.monthlyResetAt || undefined,
      updatedAt: nowIso
    };
  }
}`;
