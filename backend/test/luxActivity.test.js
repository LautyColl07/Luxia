const assert = require('node:assert/strict');
const test = require('node:test');

const activityRouter = require('../src/routes/activity.routes');
const luxRouter = require('../src/routes/lux.routes');

const { getActivityPage } = activityRouter.__testables;
const { createChatHandler, getAiContext, logLuxActivity, resolveLuxActivityReference } = luxRouter.__testables;

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

test('una interaccion LUX exige persistencia y conserva el UID autenticado como string', async () => {
  let logged = null;
  const activity = await logLuxActivity(
    { id: 'firebase-uid_123', email: 'usuario@example.test', name: 'Usuario' },
    { relatedEntityType: 'lux' },
    async (data) => {
      logged = data;
      return { id: 'activity-cuid' };
    }
  );

  assert.equal(activity.id, 'activity-cuid');
  assert.equal(logged.userId, 'firebase-uid_123');
  assert.equal(typeof logged.userId, 'string');
  assert.equal(logged.required, true);
  assert.equal(logged.description, 'Se realizo una consulta a LUX.');
  assert.equal(logged.description.includes('usuario@example.test'), false);
});

test('una falla de persistencia no se confirma como una respuesta LUX exitosa', async () => {
  await assert.rejects(
    logLuxActivity({ id: 'firebase-uid_123' }, { relatedEntityType: 'lux' }, async () => null),
    { status: 500 }
  );
});

test('el scope de estudio se valida antes de asociar una actividad LUX', async () => {
  const calls = [];
  const reference = await resolveLuxActivityReference({
    prismaClient: {
      legalStudyMember: {
        findFirst: async (args) => {
          calls.push(args);
          return { id: 'membership' };
        },
      },
      legalCase: { findFirst: async () => null },
    },
    authUser: { id: 'firebase-uid_123' },
    context: { scope: 'study', legalStudyId: 'study-cuid' },
  });

  assert.deepEqual(calls[0].where, {
    legalStudyId: 'study-cuid',
    status: 'ACTIVE',
    userId: 'firebase-uid_123',
  });
  assert.deepEqual(reference, {
    relatedEntityType: 'legal_study',
    relatedEntityId: 'study-cuid',
    relatedEntityName: 'Estudio juridico',
  });
});

test('una causa ajena no puede quedar asociada a la actividad LUX', async () => {
  await assert.rejects(
    resolveLuxActivityReference({
      prismaClient: {
        legalStudyMember: { findFirst: async () => null },
        legalCase: { findFirst: async () => null },
      },
      authUser: { id: 'firebase-uid_123' },
      context: { scope: 'personal', caseId: 'causa-ajena' },
    }),
    { status: 404 }
  );
});

test('POST /lux/chat devuelve 404 cuando la referencia de causa no esta autorizada', async () => {
  const response = createResponse();
  await createChatHandler({
    prismaClient: {
      legalStudyMember: { findFirst: async () => null },
      legalCase: { findFirst: async () => null },
    },
    aiService: async () => {
      throw new Error('La IA no debe invocarse para una causa ajena.');
    },
  })(
    {
      authUser: { id: 'firebase-uid_123' },
      body: { message: 'Consulta segura', context: { scope: 'personal', caseId: 'causa-ajena' } },
    },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    success: false,
    error: 'La causa asociada no esta disponible.',
  });
});

test('POST /lux/chat no confirma una respuesta si el registro de actividad falla', async () => {
  const response = createResponse();
  await createChatHandler({
    aiService: async () => 'Respuesta de prueba',
    activityLogger: async () => null,
  })(
    {
      authUser: { id: 'firebase-uid_123' },
      body: { message: 'Consulta general', context: { scope: 'personal' } },
    },
    response
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    error: 'No pude conectarme con LUX en este momento.',
  });
});

test('una causa autorizada se conserva como referencia de la actividad sin enviar el scope a la IA', async () => {
  let caseWhere = null;
  const reference = await resolveLuxActivityReference({
    prismaClient: {
      legalStudyMember: { findFirst: async () => null },
      legalCase: {
        findFirst: async (args) => {
          caseWhere = args.where;
          return { id: 'case-uuid', title: 'Causa identificable' };
        },
      },
    },
    authUser: { id: 'firebase-uid_123' },
    context: { scope: 'personal', caseId: 'case-uuid' },
  });

  assert.equal(caseWhere.id, 'case-uuid');
  assert.deepEqual(reference, {
    relatedEntityType: 'case',
    relatedEntityId: 'case-uuid',
    relatedEntityName: 'Causa identificable',
  });
  assert.deepEqual(getAiContext({ screen: 'dashboard', scope: 'study', legalStudyId: 'study-cuid', caseId: 'case-uuid' }), {
    screen: 'dashboard',
  });
});

test('el historial se pagina en orden descendente y nunca consulta actividades de otro UID', async () => {
  let where = null;
  const result = await getActivityPage({
    prismaClient: {
      activityLog: {
        findMany: async (args) => {
          where = args.where;
          assert.deepEqual(args.orderBy, { createdAt: 'desc' });
          return [{ id: 'activity-2', type: 'lux', title: 'Consulta', description: 'Metadata', createdAt: new Date() }];
        },
        count: async () => 101,
      },
    },
    userId: 'firebase-uid_123',
    query: { page: '2', limit: '100' },
  });

  assert.deepEqual(where, { userId: 'firebase-uid_123' });
  assert.equal(result.items[0].id, 'activity-2');
  assert.equal(result.page, 2);
  assert.equal(result.limit, 100);
  assert.equal(result.total, 101);
  assert.equal(result.totalPages, 2);
});
