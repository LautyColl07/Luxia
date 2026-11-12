import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { requirePendingStudyInvitation } from '../src/utils/studyInvitationStatus.js';

test('accepts pending invitations returned by the inbox and email-link resolver', () => {
  const invitation = { id: 'invitation-1', status: 'PENDING' };
  assert.equal(requirePendingStudyInvitation(invitation), invitation);
});

test('rejects missing or closed invitation states so the screen can offer a retry', () => {
  for (const invitation of [undefined, {}, { id: 'invitation-1' }, { status: 'ACCEPTED' }, { status: 'REVOKED' }]) {
    assert.throws(() => requirePendingStudyInvitation(invitation), { code: 'INVITATION_STATE_UNAVAILABLE' });
  }
});

test('the pending invitation screen renders both decisions and prevents repeat submissions', async () => {
  const screen = await readFile(new URL('../src/screens/StudyInvitationsScreen.js', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8');
  assert.match(screen, /invitation\.status === 'PENDING'[\s\S]{0,600}Rechazar[\s\S]{0,350}Aceptar invitación/);
  assert.match(screen, /onPress=\{\(\) => respond\('DECLINED'\)\}/);
  assert.match(screen, /onPress=\{\(\) => respond\('ACCEPTED'\)\}/);
  assert.match(screen, /disabled=\{busy\}/);
  assert.match(screen, /refreshLegalStudies\(\)/);
  assert.match(screen, /INVITATION_STATE_UNAVAILABLE/);
  assert.match(screen, /onPress=\{load\}/);
  assert.match(api, /response\.data\.map\(requirePendingStudyInvitation\)/);
  assert.match(api, /return requirePendingStudyInvitation\(response\?\.data \|\| response\)/);
});
