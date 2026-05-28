function createRelativeDate(daysOffset, hours, minutes) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const mockActivity = [
  {
    id: 'activity-001',
    type: 'case',
    title: 'Causa creada',
    description: 'Se registro una nueva causa con caratula y juzgado inicial.',
    createdAt: createRelativeDate(0, 8, 55),
    relatedEntityName: 'Martinez c/ Banco Federal',
    relatedEntityId: '105',
  },
  {
    id: 'activity-002',
    type: 'case',
    title: 'Causa actualizada',
    description: 'Se ajustaron los datos del expediente y la estrategia procesal.',
    createdAt: createRelativeDate(0, 10, 25),
    relatedEntityName: 'Gonzalez c/ Lopez',
    relatedEntityId: '101',
  },
  {
    id: 'activity-003',
    type: 'lux',
    title: 'Consulta realizada a LUX',
    description: 'Se consulto jurisprudencia aplicable para una audiencia preliminar.',
    createdAt: createRelativeDate(0, 12, 40),
    relatedEntityName: 'Gonzalez c/ Lopez',
    relatedEntityId: '101',
  },
  {
    id: 'activity-004',
    type: 'task',
    title: 'Tarea completada',
    description: 'Se marco como resuelta la revision de estrategia de audiencia.',
    createdAt: createRelativeDate(0, 16, 10),
    relatedEntityName: 'Revisar estrategia de audiencia preliminar',
    relatedEntityId: '401',
  },
  {
    id: 'activity-005',
    type: 'hearing',
    title: 'Audiencia registrada',
    description: 'Se agendo una nueva audiencia con modalidad virtual.',
    createdAt: createRelativeDate(-1, 9, 20),
    relatedEntityName: 'Conciliacion con aseguradora',
    relatedEntityId: '202',
  },
  {
    id: 'activity-006',
    type: 'document',
    title: 'Documento subido',
    description: 'Se incorporo documentacion de respaldo al expediente.',
    createdAt: createRelativeDate(-1, 14, 35),
    relatedEntityName: 'poliza_seguro.pdf',
    relatedEntityId: '303',
  },
  {
    id: 'activity-007',
    type: 'hearing',
    title: 'Audiencia modificada',
    description: 'Se actualizo el horario de audiencia y la sala asignada.',
    createdAt: createRelativeDate(-3, 11, 5),
    relatedEntityName: 'Presentacion de herederos',
    relatedEntityId: '203',
  },
  {
    id: 'activity-008',
    type: 'transcript',
    title: 'Transcripcion guardada',
    description: 'Se almaceno la version final de la transcripcion de audiencia.',
    createdAt: createRelativeDate(-4, 17, 15),
    relatedEntityName: 'Audiencia preliminar',
    relatedEntityId: 'transcript-201',
  },
  {
    id: 'activity-009',
    type: 'case',
    title: 'Cambio de estado de una causa',
    description: 'La causa paso de En revision a Activa para seguimiento prioritario.',
    createdAt: createRelativeDate(-5, 13, 50),
    relatedEntityName: 'Fernandez c/ Seguros del Plata',
    relatedEntityId: '102',
  },
  {
    id: 'activity-010',
    type: 'task',
    title: 'Tarea creada',
    description: 'Se agrego una tarea para preparar documentacion complementaria.',
    createdAt: createRelativeDate(-6, 9, 45),
    relatedEntityName: 'Solicitar pericia complementaria',
    relatedEntityId: '402',
  },
  {
    id: 'activity-011',
    type: 'document',
    title: 'Documento subido',
    description: 'Se cargo el inventario patrimonial dentro de la causa sucesoria.',
    createdAt: createRelativeDate(-12, 15, 5),
    relatedEntityName: 'inventario_bienes.docx',
    relatedEntityId: '304',
  },
  {
    id: 'activity-012',
    type: 'case',
    title: 'Causa creada',
    description: 'Se abrio un nuevo expediente para mediacion por expensas.',
    createdAt: createRelativeDate(-18, 10, 15),
    relatedEntityName: 'Mendoza c/ Consorcio Belgrano 441',
    relatedEntityId: '104',
  },
];

export default mockActivity;
