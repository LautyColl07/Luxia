export type PendingStudyInvitation = {
  invitationId: string;
  token: string;
};

export const PENDING_STUDY_INVITATION_TTL_MS: number;
export function savePendingStudyInvitation(invitation: PendingStudyInvitation, now?: number): boolean;
export function readPendingStudyInvitation(now?: number): PendingStudyInvitation | null;
export function clearPendingStudyInvitation(): void;
