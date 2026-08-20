const assert = require('node:assert/strict');
const test = require('node:test');

const documentsRouter = require('../src/routes/documents.routes');

const { getAuthorizedHearing } = documentsRouter.__testables;

test('la carga autoriza una audiencia de un caso personal del usuario', async () => {
  let query = null;
  const prisma = {
    hearing: {
      findFirst: async (args) => {
        query = args;
        return { id: 'hearing-1', caseId: 'case-1' };
      },
    },
  };

  const hearing = await getAuthorizedHearing('hearing-1', {
    authUser: { id: 'user-1' },
    query: { scope: 'personal' },
  }, prisma);

  assert.equal(hearing.caseId, 'case-1');
  assert.deepEqual(query.where.case, {
    OR: [
      { createdById: 'user-1' },
      { ownerUserId: 'user-1' },
      { userId: 'user-1' },
    ],
  });
});

test('la carga respeta la membresia activa del estudio juridico', async () => {
  let query = null;
  const prisma = {
    legalStudyMember: {
      findFirst: async () => ({ id: 'membership-1' }),
    },
    hearing: {
      findFirst: async (args) => {
        query = args;
        return { id: 'hearing-1', caseId: 'case-1' };
      },
    },
  };

  const hearing = await getAuthorizedHearing('hearing-1', {
    authUser: { id: 'user-1' },
    query: { scope: 'study', legalStudyId: 'study-1' },
  }, prisma);

  assert.equal(hearing.id, 'hearing-1');
  assert.deepEqual(query.where.case, { legalStudyId: 'study-1' });
});
