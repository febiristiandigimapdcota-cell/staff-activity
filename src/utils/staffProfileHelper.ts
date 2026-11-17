import { StaffProfile } from '../types';

export function buildStaffProfileId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `sp_${slug || Date.now()}`;
}

export function normalizeProfileKey(name?: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function findStaffProfileByName(
  profiles: StaffProfile[] | undefined | null,
  name?: string
): StaffProfile | undefined {
  if (!profiles || profiles.length === 0 || !name) return undefined;
  const target = normalizeProfileKey(name);
  if (!target) return undefined;

  const exact = profiles.find((p) => normalizeProfileKey(p.name) === target);
  if (exact) return exact;

  const targetAlpha = target.replace(/[^a-z0-9]/g, '');
  if (!targetAlpha) return undefined;
  return profiles.find((p) => normalizeProfileKey(p.name).replace(/[^a-z0-9]/g, '') === targetAlpha);
}

export function buildStaffProfileMap(
  profiles: StaffProfile[] | undefined | null
): Map<string, StaffProfile> {
  const map = new Map<string, StaffProfile>();
  if (!profiles) return map;
  profiles.forEach((p) => {
    const key = normalizeProfileKey(p.name);
    if (key) {
      map.set(key, p);
      const alphaKey = key.replace(/[^a-z0-9]/g, '');
      if (alphaKey && !map.has(alphaKey)) {
        map.set(alphaKey, p);
      }
    }
  });
  return map;
}

export function lookupStaffProfile(
  profileMap: Map<string, StaffProfile> | undefined | null,
  name?: string
): StaffProfile | undefined {
  if (!profileMap || !name) return undefined;
  const key = normalizeProfileKey(name);
  if (!key) return undefined;
  return profileMap.get(key) || profileMap.get(key.replace(/[^a-z0-9]/g, ''));
}

export function calculateWorkTenure(
  joinDate?: string,
  fallbackText?: string,
  referenceDate: Date = new Date()
): string {
  if (joinDate && /^\d{4}-\d{2}-\d{2}$/.test(joinDate.trim())) {
    const start = new Date(`${joinDate.trim()}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const ref = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
      );
      if (start > ref) {
        return fallbackText?.trim() || 'Baru Bergabung';
      }

      let years = ref.getFullYear() - start.getFullYear();
      let months = ref.getMonth() - start.getMonth();
      let days = ref.getDate() - start.getDate();

      if (days < 0) {
        months -= 1;
        const prevMonthLastDay = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
        days += prevMonthLastDay;
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }

      if (years > 0 && months > 0) {
        return `${years} Tahun ${months} Bulan`;
      }
      if (years > 0) {
        return `${years} Tahun`;
      }
      if (months > 0) {
        return `${months} Bulan`;
      }
      return `${Math.max(1, days)} Hari`;
    }
  }

  return fallbackText?.trim() || '-';
}
