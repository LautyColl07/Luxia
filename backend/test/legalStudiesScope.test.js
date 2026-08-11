const assert = require('node:assert/strict');
const test = require('node:test');

const legalStudiesRouter = require('../src/routes/legalStudies.routes');
const documentsRouter = require('../src/routes/documents.routes');

test('un estudio se crea para el usuario autenticado sin usar el nombre como credencial de acceso', async () => {
  let studyData = null;
  const prisma = {
    user: { upsert: async () => undefined },
    legalStudyMember: { findFirst: async () => null },
    legalStudy: {
      create: async ({ data }) => {
        studyData = data;
        return { id: 'study-private', name: data.name };
      },
    },
  };

  const study = await legalStudiesRouter.__testables.createStudyForUser(
    prisma,
    { id: 'user-1', email: 'abogada@example.test', name: 'Abogada' },
    '  Estudio  Legal  Sur  '
  );

  assert.deepEqual(study, { id: 'study-private', name: 'Estudio Legal Sur' });
  assert.equal(studyData.members.create.userId, 'user-1');
  assert.equal(studyData.members.create.status, 'ACTIVE');
});

test('los documentos se filtran por la causa autorizada, tanto personal como de estudio', () => {
  const personalScope = { OR: [{ createdById: 'user-1' }] };
  const studyScope = { legalStudyId: 'study-1' };

  assert.deepEqual(documentsRouter.__testables.buildScopedFileWhere(personalScope), {
    case: personalScope,
  });
  assert.deepEqual(documentsRouter.__testables.buildScopedFileWhere(studyScope), {
    case: studyScope,
  });
});
