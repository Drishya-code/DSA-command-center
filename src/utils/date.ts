import { addDays, format, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';

/** Always store/compare dates as `yyyy-MM-dd` ISO date strings (no time component). */
export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');

export const todayISO = (): string => toISODate(new Date());

export const addDaysISO = (isoDate: string, days: number): string =>
  toISODate(addDays(parseISO(isoDate), days));

export const isPastOrToday = (isoDate: string): boolean => {
  const target = startOfDay(parseISO(isoDate));
  const today = startOfDay(new Date());
  return isBefore(target, today) || isSameDay(target, today);
};

export const isTodayISO = (isoDate: string): boolean => isoDate === todayISO();

export const formatFriendlyDate = (isoDate: string): string =>
  format(parseISO(isoDate), 'EEEE, MMMM d');

export const formatShortDate = (isoDate: string): string => format(parseISO(isoDate), 'MMM d');

export const minutesToLabel = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/** Last N ISO dates ending today, oldest first. */
export const lastNDays = (n: number): string[] => {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDaysISO(todayISO(), -i));
  }
  return out;
};
