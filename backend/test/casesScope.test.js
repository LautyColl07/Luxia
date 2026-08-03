const assert = require('node:assert/strict');
const test = require('node:test');

const { getCaseScopeWhere } = require('../src/lib/studyScope');
const casesRouter = require('../src/routes/cases.routes');
const hearingsRouter = require('../src/routes/hearingTranscription.routes');

const { buildListWhere, createCaseForUser, normalizeCaseStatus, normalizeRequestedScope, validateCaseId } = casesRouter.__testables;
const { createHearingForUser } = hearingsRouter.__testables;

function createMembershipPrisma(member = null) {
  return {
    legalStudyMember: {
      findFirst: async () => member,
    },
  };
}

test('el alcance personal incluye solamente causas del usuario autenticado', async () => {
  const where = await getCaseScopeWhere(createMembershipPrisma(), {
    authUser: { id: 'usuario-propio' },
    query: { scope: 'personal' },
  });

  assert.deepEqual(where, {
    OR: [
      { createdById: 'usuario-propio' },
      { ownerUserId: 'usuario-propio' },
      { userId: 'usuario-propio' },
    ],
  });
});

test('el alcance de estudio exige una membresia activa y no acepta otro estudio', async () => {
  const request = {
    authUser: { id: 'usuario-propio' },
    query: { scope: 'study', legalStudyId: 'estudio-propio' },
  };
  const where = await getCaseScopeWhere(createMembershipPrisma({ id: 'membership' }), request);
  assert.deepEqual(where, { legalStudyId: 'estudio-propio' });

  await assert.rejects(
    getCaseScopeWhere(createMembershipPrisma(null), {
      ...request,
      query: { scope: 'study', legalStudyId: 'estudio-ajeno' },
    }),
    { status: 403 }
  );
});

test('la lista conserva el alcance autorizado y normaliza filtros y paginacion', () => {
  const scope = {
    OR: [{ userId: 'usuario-propio' }],
  };
  const where = buildListWhere(scope, {
    status: 'Activa',
    court: 'Civil',
    search: 'Gonzalez',
  });

  assert.deepEqual(where.OR, scope.OR);
  assert.equal(where.status, 'active');
  assert.deepEqual(where.court, { contains: 'Civil' });
  assert.deepEqual(where.title, { contains: 'Gonzalez' });
  assert.equal(normalizeCaseStatus('Archivada'), 'archived');
  assert.equal(normalizeRequestedScope('LEGAL_STUDY'), 'study');
  assert.equal(validateCaseId('case_123-abc'), 'case_123-abc');
});

test('identificadores y ordenamientos invalidos se rechazan antes de consultar', () => {
  assert.throws(() => validateCaseId('../otra-causa'), { status: 400 });
  assert.throws(() => normalizeCaseStatus('DROP TABLE'), { status: 400 });
  assert.throws(() => normalizeRequestedScope('otro'), { status: 400 });
});

test('una causa nueva se persiste con el propietario autenticado y aparece en su alcance', async () => {
  let createdData = null;
  const prisma = {
    user: { upsert: async () => ({ id: 'usuario-propio' }) },
    legalStudyMember: { findFirst: async () => null },
    legalCase: {
      create: async ({ data }) => {
        createdData = data;
        return { ...data, createdAt: new Date(), updatedAt: new Date() };
      },
    },
  };

  const created = await createCaseForUser({
    prismaClient: prisma,
    user: { id: 'usuario-propio', email: null, name: null },
    body: { title: 'Causa valida', status: 'Activa', scope: 'PRIVATE' },
    activityLogger: async () => null,
  });

  assert.equal(created.userId, 'usuario-propio');
  assert.equal(created.createdById, 'usuario-propio');
  assert.equal(created.ownerUserId, 'usuario-propio');
  assert.equal(createdData.status, 'active');
  assert.match(created.id, /^[A-Za-z0-9-]+$/);
});

test('una audiencia conserva el ID string de una causa autorizada', async () => {
  let hearingData = null;
  const prisma = {
    user: { upsert: async () => ({ id: 'usuario-propio' }) },
    legalStudyMember: { findFirst: async () => null },
    legalCase: { findFirst: async () => ({ id: 'case_string_123', title: 'Causa valida' }) },
    hearing: {
      create: async ({ data }) => {
        hearingData = data;
        return { ...data, createdAt: new Date(), updatedAt: new Date(), case: { title: 'Causa valida' } };
      },
    },
  };

  const created = await createHearingForUser({
    prismaClient: prisma,
    req: { query: { scope: 'personal' } },
    user: { id: 'usuario-propio', email: null, name: null },
    body: { caseId: 'case_string_123', title: 'Audiencia valida', date: '2026-08-03T10:00:00.000Z' },
    activityLogger: async () => null,
  });

  assert.equal(hearingData.caseId, 'case_string_123');
  assert.equal(created.caseId, 'case_string_123');
});

test('una audiencia no puede vincular una causa fuera del alcance autorizado', async () => {
  let created = false;
  const prisma = {
    user: { upsert: async () => ({ id: 'usuario-propio' }) },
    legalStudyMember: { findFirst: async () => null },
    legalCase: { findFirst: async () => null },
    hearing: { create: async () => { created = true; } },
  };

  await assert.rejects(
    createHearingForUser({
      prismaClient: prisma,
      req: { query: { scope: 'personal' } },
      user: { id: 'usuario-propio', email: null, name: null },
      body: { caseId: 'case_ajena', title: 'Audiencia rechazada', date: '2026-08-03T10:00:00.000Z' },
      activityLogger: async () => null,
    }),
    { status: 404 }
  );
  assert.equal(created, false);
});
