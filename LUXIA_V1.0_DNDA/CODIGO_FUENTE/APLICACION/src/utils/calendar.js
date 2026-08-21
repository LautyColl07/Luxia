const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

export const AREA_CONFIG = {
  civil: { key: 'civil', label: 'Civil', color: '#4A83F6' },
  family: { key: 'family', label: 'Familia / Sucesiones', color: '#8B5CF6' },
  labor: { key: 'labor', label: 'Laboral', color: '#12B76A' },
  criminal: { key: 'criminal', label: 'Penal', color: '#6B7280' },
  insurance: { key: 'insurance', label: 'Seguros', color: '#D97706' },
  general: { key: 'general', label: 'General', color: '#0F2F56' },
};

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAreaKeyFromText(text) {
  const normalizedText = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/seguro|aseguradora|poliza/.test(normalizedText)) {
    return 'insurance';
  }

  if (/sucesion|familia|heredero|alimento/.test(normalizedText)) {
    return 'family';
  }

  if (/labor|despido|trabajo/.test(normalizedText)) {
    return 'labor';
  }

  if (/penal|fiscal|delito|criminal/.test(normalizedText)) {
    return 'criminal';
  }

  if (/civil|mediacion|contractual|danos|daños/.test(normalizedText)) {
    return 'civil';
  }

  return '';
}

export function inferLegalArea(caseItem = {}, fallbackText = '') {
  const explicitArea = caseItem.area ?? caseItem.category ?? caseItem.categoria ?? caseItem.fuero;
  const explicitKey = getAreaKeyFromText(explicitArea);

  if (explicitKey) {
    return AREA_CONFIG[explicitKey];
  }

  const composedText = [
    caseItem.title,
    caseItem.titulo,
    caseItem.description,
    caseItem.descripcion,
    caseItem.court,
    caseItem.juzgado,
    fallbackText,
  ]
    .filter(Boolean)
    .join(' ');

  const inferredKey = getAreaKeyFromText(composedText);
  return AREA_CONFIG[inferredKey || 'civil'] || AREA_CONFIG.general;
}

export function startOfDay(value) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getDateKey(value) {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isSameMonth(dateA, dateB) {
  const first = toDate(dateA);
  const second = toDate(dateB);

  if (!first || !second) {
    return false;
  }

  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

export function isSameDay(dateA, dateB) {
  return getDateKey(dateA) === getDateKey(dateB);
}

export function addMonths(dateValue, amount) {
  const date = toDate(dateValue) || new Date();
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function getMonthMatrix(dateValue) {
  const date = toDate(dateValue) || new Date();
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;
  const firstCell = new Date(firstDayOfMonth);
  firstCell.setDate(firstDayOfMonth.getDate() - startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setDate(firstCell.getDate() + index);
    return day;
  });
}

export function formatMonthYear(dateValue) {
  const date = toDate(dateValue) || new Date();

  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatAgendaDate(dateValue) {
  const date = toDate(dateValue) || new Date();

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function getWeekdayLabels() {
  return WEEKDAY_LABELS;
}

export function buildCalendarEvents({ hearings = [], caseDetails = [], cases = [] }) {
  const caseMap = new Map();

  [...cases, ...caseDetails].forEach((item) => {
    if (item?.id !== undefined && item?.id !== null) {
      caseMap.set(String(item.id), item);
    }
  });

  const hearingEvents = hearings
    .filter((item) => item?.date)
    .map((item) => {
      const relatedCase = caseMap.get(String(item?.caseId)) || {};
      const area = inferLegalArea(relatedCase, item?.caseTitle);

      return {
        id: `hearing-${item?.id}`,
        sourceId: item?.id,
        type: 'hearing',
        date: item?.date,
        title: item?.title || 'Audiencia sin titulo',
        caseId: item?.caseId,
        caseTitle: item?.caseTitle || relatedCase?.title || 'Causa sin referencia',
        court: item?.court || relatedCase?.court || 'Juzgado a confirmar',
        area,
        status: item?.status || 'Programada',
        meta: item?.modality || 'Modalidad a confirmar',
      };
    });

  const taskEvents = caseDetails.flatMap((caseItem) => {
    const area = inferLegalArea(caseItem);

    return (caseItem?.tasks || []).filter((task) => task?.dueDate).map((task) => ({
      id: `task-${task?.id}`,
      sourceId: task?.id,
      type: 'task',
      date: task?.dueDate,
      title: task?.completed ? task?.title || 'Tarea sin titulo' : `Vencimiento: ${task?.title || 'Tarea sin titulo'}`,
      caseId: caseItem?.id,
      caseTitle: caseItem?.title || 'Causa sin referencia',
      court: caseItem?.court || 'Juzgado a confirmar',
      area,
      status: task?.completed ? 'Finalizada' : 'Pendiente',
      completed: Boolean(task?.completed),
      meta: 'Seguimiento procesal',
    }));
  });

  return [...hearingEvents, ...taskEvents].sort((first, second) => {
    const firstDate = toDate(first?.date);
    const secondDate = toDate(second?.date);
    return (firstDate?.getTime() || 0) - (secondDate?.getTime() || 0);
  });
}

export function groupEventsByDate(events = []) {
  return events.reduce((accumulator, event) => {
    const key = getDateKey(event?.date);

    if (!key) {
      return accumulator;
    }

    if (!accumulator[key]) {
      accumulator[key] = [];
    }

    accumulator[key].push(event);
    return accumulator;
  }, {});
}
