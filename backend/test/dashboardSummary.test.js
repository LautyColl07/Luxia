const assert = require('node:assert/strict');
const test = require('node:test');

const dashboardRouter = require('../src/routes/dashboard.routes');

test('el resumen del dashboard consulta solo datos del alcance autorizado', async () => {
  const calls = [];
  const prisma = {
    legalStudyMember: { findFirst: async () => ({ id: 'membership' }) },
    legalCase: {
      count: async (args) => {
        calls.push(['cases', args.where]);
        return 2;
      },
    },
    hearing: {
      count: async (args) => {
        calls.push(['hearings-today', args.where]);
        return 1;
      },
      findMany: async (args) => {
        calls.push(['hearings-upcoming', args.where]);
        return [{ id: 'hearing-1', title: 'Audiencia', date: new Date('2026-08-12T12:00:00Z'), caseId: 'case-1', case: { title: 'Caso', court: 'Civil' } }];
      },
    },
    file: {
      count: async (args) => {
        calls.push(['files', args.where]);
        return 3;
      },
    },
  };
  const req = { authUser: { id: 'user-1', email: 'abogada@example.test', name: 'Abogada' }, query: { scope: 'study', legalStudyId: 'study-1' } };

  const summary = await dashboardRouter.__testables.getDashboardSummary({
    prismaClient: prisma,
    req,
    now: new Date('2026-08-11T10:00:00Z'),
  });

  assert.deepEqual(summary.metricas, { causasActivas: 2, audienciasHoy: 1, documentos: 3, tareasPendientes: 0 });
  assert.equal(summary.proximasAudiencias[0].caseTitle, 'Caso');
  assert.ok(calls.every(([, where]) => JSON.stringify(where).includes('study-1')));
});
