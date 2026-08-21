function getTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getNameFromEmail(email) {
  const normalizedEmail = getTrimmedString(email);

  if (!normalizedEmail.includes('@')) {
    return '';
  }

  const [localPart] = normalizedEmail.split('@');
  return getTrimmedString(localPart);
}

function getCombinedName(source) {
  const firstName = getTrimmedString(source?.firstName ?? source?.nombre);
  const lastName = getTrimmedString(source?.lastName ?? source?.apellido);

  return `${firstName} ${lastName}`.trim();
}

function toCandidates(source) {
  if (!source) {
    return [];
  }

  return [
    getTrimmedString(source.displayName),
    getTrimmedString(source.name),
    getTrimmedString(source.nombre),
    getTrimmedString(source.fullName),
    getTrimmedString(source.username),
    getCombinedName(source),
    getNameFromEmail(source.email ?? source.correo),
  ].filter(Boolean);
}

function pickFirstValue(sources, resolver, fallback = '') {
  for (const source of sources) {
    const value = resolver(source);

    if (value) {
      return value;
    }
  }

  return fallback;
}

export function getUserDisplayName(...sources) {
  const name = pickFirstValue(sources, (source) => toCandidates(source)[0], 'Usuario');
  return name || 'Usuario';
}

export function getUserEmail(...sources) {
  return pickFirstValue(
    sources,
    (source) => getTrimmedString(source?.email ?? source?.correo),
    ''
  );
}

export function getUserRole(...sources) {
  return pickFirstValue(
    sources,
    (source) => getTrimmedString(source?.role ?? source?.rol),
    'Profesional'
  );
}

export function getUserInitials(...sources) {
  const displayName = getUserDisplayName(...sources);
  const parts = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return 'LU';
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return initials || 'LU';
}

export function buildDisplayUser(...sources) {
  return {
    name: getUserDisplayName(...sources),
    email: getUserEmail(...sources),
    role: getUserRole(...sources),
    initials: getUserInitials(...sources),
  };
}
