export function requirePendingStudyInvitation(invitation) {
  if (!invitation || invitation.status !== 'PENDING') {
    const error = new Error('No pudimos verificar el estado de la invitación. Actualizá la pantalla para volver a intentarlo.');
    error.code = 'INVITATION_STATE_UNAVAILABLE';
    throw error;
  }

  return invitation;
}
