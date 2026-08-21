const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_ALLOWED_REGEX = /^[a-z0-9._-]+$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "root",
  "soporte",
  "luxia",
  "api",
  "null",
  "undefined",
]);

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sanitizeUsernameSeed(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

function ensureUsernameLength(value: string) {
  if (value.length >= USERNAME_MIN_LENGTH) {
    return value.slice(0, USERNAME_MAX_LENGTH);
  }

  const paddedValue = `${value}user`;
  return paddedValue.slice(0, USERNAME_MAX_LENGTH);
}

function avoidReservedUsername(value: string) {
  if (!RESERVED_USERNAMES.has(value)) {
    return value;
  }

  return `${value}_user`.slice(0, USERNAME_MAX_LENGTH);
}

export function normalizeLoginIdentifier(identifier: string) {
  const trimmedIdentifier = identifier.trim();

  if (!trimmedIdentifier) {
    return "";
  }

  if (!trimmedIdentifier.includes("@")) {
    return trimmedIdentifier.toLowerCase();
  }

  return trimmedIdentifier;
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/\s+/g, "");
}

export function getUsernameValidationError(username: string) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    return null;
  }

  if (normalizedUsername.length < USERNAME_MIN_LENGTH) {
    return `El usuario debe tener al menos ${USERNAME_MIN_LENGTH} caracteres`;
  }

  if (normalizedUsername.length > USERNAME_MAX_LENGTH) {
    return `El usuario debe tener como maximo ${USERNAME_MAX_LENGTH} caracteres`;
  }

  if (!USERNAME_ALLOWED_REGEX.test(normalizedUsername)) {
    return "El usuario solo puede incluir letras, numeros, punto, guion bajo o guion medio";
  }

  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    return "Ese nombre de usuario no esta disponible";
  }

  return null;
}

export function generateUsernameCandidate({
  firstName,
  lastName,
  email,
}: {
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const emailLocalPart = String(email || "").split("@")[0] || "";
  const rawCandidates = [
    `${firstName || ""}${lastName || ""}`,
    `${firstName || ""}.${lastName || ""}`,
    firstName || "",
    emailLocalPart,
    "luxiauser",
  ];

  for (const candidate of rawCandidates) {
    const sanitizedCandidate = sanitizeUsernameSeed(candidate);

    if (!sanitizedCandidate) {
      continue;
    }

    const safeUsername = avoidReservedUsername(ensureUsernameLength(sanitizedCandidate));

    if (!getUsernameValidationError(safeUsername)) {
      return safeUsername;
    }
  }

  return "luxiauser";
}

export function resolveRegisterUsername({
  firstName,
  lastName,
  email,
  username,
}: {
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
}) {
  const explicitUsername = normalizeUsername(username || "");

  if (explicitUsername) {
    return explicitUsername;
  }

  return generateUsernameCandidate({
    firstName,
    lastName,
    email,
  });
}
