import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingStudyInvitation,
  PENDING_STUDY_INVITATION_TTL_MS,
  readPendingStudyInvitation,
  savePendingStudyInvitation,
} from '../src/utils/pendingStudyInvitation.js';

function withSessionStorage(callback) {
  const previousWindow = globalThis.window;
  const data = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); },
      removeItem(key) { data.delete(key); },
    },
  };
  try { return callback(data); }
  finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('preserves an invitation token only in the current tab session', () => withSessionStorage((data) => {
  const invitation = { invitationId: 'invitation-1', token: 'private-token' };
  assert.equal(savePendingStudyInvitation(invitation, 1000), true);
  assert.deepEqual(readPendingStudyInvitation(2000), invitation);
  assert.equal(data.size, 1);
  clearPendingStudyInvitation();
  assert.equal(data.size, 0);
}));

test('expires pending invitation tokens and rejects malformed data', () => withSessionStorage((data) => {
  savePendingStudyInvitation({ invitationId: 'invitation-1', token: 'private-token' }, 1000);
  assert.equal(readPendingStudyInvitation(1000 + PENDING_STUDY_INVITATION_TTL_MS), null);
  assert.equal(data.size, 0);
  data.set('luxia.pendingStudyInvitation.v1', '{invalid');
  assert.equal(readPendingStudyInvitation(2000), null);
  assert.equal(data.size, 0);
}));
