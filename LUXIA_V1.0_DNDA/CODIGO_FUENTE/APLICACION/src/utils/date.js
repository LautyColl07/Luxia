const ARGENTINA_LOCALE = 'es-AR';

function normalizeDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSameDay(dateA, dateB) {
  const first = normalizeDate(dateA);
  const second = normalizeDate(dateB);

  if (!first || !second) {
    return false;
  }

  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function isToday(dateValue) {
  return isSameDay(normalizeDate(dateValue), new Date());
}

function formatWithLocale(date, options) {
  return new Intl.DateTimeFormat(ARGENTINA_LOCALE, options).format(date);
}

export function formatDate(dateValue) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return 'Sin fecha';
  }

  return formatWithLocale(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatShortDate(dateValue) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return 'Sin fecha';
  }

  if (isToday(date)) {
    return 'Hoy';
  }

  return formatWithLocale(date, {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatTime(dateValue) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return '--:-- hs';
  }

  return `${formatWithLocale(date, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} hs`;
}

export function formatLongDate(dateValue) {
  return formatDate(dateValue);
}

export function formatDateTime(dateValue) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return 'Sin fecha';
  }

  return `${formatDate(date)} · ${formatTime(date)}`;
}

export function formatDateTextInput(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatTimeTextInput(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function parseMaskedDateToIso(dateValue) {
  const normalizedDate = String(dateValue ?? '').trim();
  const match = normalizedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsedDate = normalizeDate(`${isoDate}T00:00:00`);

  if (!parsedDate) {
    return null;
  }

  const isSameCalendarDate =
    parsedDate.getFullYear() === Number(year) &&
    parsedDate.getMonth() + 1 === Number(month) &&
    parsedDate.getDate() === Number(day);

  return isSameCalendarDate ? isoDate : null;
}

export function formatDateTimeInput(date, time) {
  const normalizedDate = String(date ?? '').includes('/')
    ? parseMaskedDateToIso(date)
    : String(date ?? '').trim();
  const normalized = normalizeDate(`${normalizedDate}T${time}:00`);
  return normalized ? normalized.toISOString() : null;
}

export function isUpcoming(dateValue) {
  const date = normalizeDate(dateValue);
  return Boolean(date && date.getTime() >= Date.now());
}

export function sortByDateAsc(items, key = 'date') {
  return [...items].sort((first, second) => {
    const firstDate = normalizeDate(first[key]);
    const secondDate = normalizeDate(second[key]);
    const firstTime = firstDate ? firstDate.getTime() : Number.MAX_SAFE_INTEGER;
    const secondTime = secondDate ? secondDate.getTime() : Number.MAX_SAFE_INTEGER;

    return firstTime - secondTime;
  });
}

export function matchesCalendarFilter(dateValue, filter) {
  const date = normalizeDate(dateValue);

  if (!date) {
    return false;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  if (filter === 'today') {
    return date >= startOfToday && date <= endOfToday;
  }

  if (filter === 'week') {
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(23, 59, 59, 999);
    return date >= startOfToday && date <= endOfWeek;
  }

  if (filter === 'month') {
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  }

  return true;
}
