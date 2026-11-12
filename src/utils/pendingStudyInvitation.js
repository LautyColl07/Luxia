const STORAGE_KEY = 'luxia.pendingStudyInvitation.v1';
export const PENDING_STUDY_INVITATION_TTL_MS = 60 * 60 * 1000;

function getSessionStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function savePendingStudyInvitation(invitation, now = Date.now()) {
  const storage = getSessionStorage();
  if (!storage || !invitation || typeof invitation.invitationId !== 'string' || typeof invitation.token !== 'string') return false;
  if (!invitation.invitationId.trim() || !invitation.token.trim() || invitation.token.length > 200) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      invitationId: invitation.invitationId,
      token: invitation.token,
      expiresAt: now + PENDING_STUDY_INVITATION_TTL_MS,
    }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingStudyInvitation(now = Date.now()) {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const valid = typeof saved?.invitationId === 'string'
      && saved.invitationId.trim()
      && typeof saved?.token === 'string'
      && saved.token.trim()
      && saved.token.length <= 200
      && Number.isFinite(saved.expiresAt)
      && saved.expiresAt > now;
    if (!valid) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return { invitationId: saved.invitationId, token: saved.token };
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function clearPendingStudyInvitation() {
  const storage = getSessionStorage();
  if (!storage) return;
  try { storage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
}
