const STATUS_LABELS = {
  activa: 'Activa',
  active: 'Activa',
  pendiente: 'Pendiente',
  pending: 'Pendiente',
  en_curso: 'En Curso',
  encurso: 'En Curso',
  sin_fecha: 'Sin fecha',
  sinfecha: 'Sin fecha',
  finalizada: 'Finalizada',
  finalized: 'Finalizada',
  archivada: 'Archivada',
  archived: 'Archivada',
  cerrada: 'Finalizada',
  completada: 'Finalizada',
  completed: 'Finalizada',
  realizada: 'Finalizada',
  programada: 'Programada',
  confirmada: 'Confirmada',
  revision: 'En revision',
  enrevision: 'En revision',
  en_proceso: 'En proceso',
  enproceso: 'En proceso',
  inprogress: 'En proceso',
};

function normalizeStatusKey(status) {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '')
    .replace(/[^a-z_]/g, '');
}

export function normalizeStatusLabel(status, fallback = 'Pendiente') {
  const normalizedKey = normalizeStatusKey(status);

  if (!normalizedKey) {
    return fallback;
  }

  return STATUS_LABELS[normalizedKey] || fallback;
}

export function getStatusTone(status) {
  const normalizedLabel = normalizeStatusLabel(status, 'Pendiente');

  switch (normalizedLabel) {
    case 'Activa':
    case 'Confirmada':
      return 'success';
    case 'En Curso':
      return 'warning';
    case 'Pendiente':
    case 'Programada':
    case 'En proceso':
    case 'En revision':
      return 'warning';
    case 'Archivada':
    case 'Sin fecha':
      return 'neutral';
    case 'Finalizada':
      return 'danger';
    default:
      return 'default';
  }
}
