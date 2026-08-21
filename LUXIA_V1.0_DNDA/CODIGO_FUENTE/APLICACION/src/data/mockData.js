function createRelativeDate(daysOffset, hours, minutes) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const user = {
  id: 1,
  name: 'Usuario',
  email: 'usuario@luxia.com',
  role: 'Profesional',
};

const cases = [
  {
    id: 101,
    title: 'Gonzalez c/ Lopez',
    description: 'Reclamo por incumplimiento contractual y daños emergentes.',
    status: 'Activa',
    court: 'Juzgado Civil N° 12',
    createdAt: createRelativeDate(-18, 9, 30),
  },
  {
    id: 102,
    title: 'Fernandez c/ Seguros del Plata',
    description: 'Cobertura denegada en siniestro automotor.',
    status: 'En revisión',
    court: 'Cámara Comercial Sala B',
    createdAt: createRelativeDate(-12, 11, 15),
  },
  {
    id: 103,
    title: 'Sucesión Ramírez',
    description: 'Seguimiento de declaratoria y distribución patrimonial.',
    status: 'Activa',
    court: 'Juzgado de Familia N° 4',
    createdAt: createRelativeDate(-7, 10, 0),
  },
  {
    id: 104,
    title: 'Mendoza c/ Consorcio Belgrano 441',
    description: 'Mediación por expensas y vicios en mantenimiento.',
    status: 'Cerrada',
    court: 'Centro de Mediación CABA',
    createdAt: createRelativeDate(-32, 16, 45),
  },
];

const hearings = [
  {
    id: 201,
    caseId: 101,
    title: 'Audiencia preliminar',
    date: createRelativeDate(0, 10, 30),
    modality: 'Presencial',
    location: 'Sala 3',
    status: 'Confirmada',
  },
  {
    id: 202,
    caseId: 102,
    title: 'Conciliación con aseguradora',
    date: createRelativeDate(1, 9, 0),
    modality: 'Virtual',
    location: 'Zoom institucional',
    status: 'Programada',
  },
  {
    id: 203,
    caseId: 103,
    title: 'Presentación de herederos',
    date: createRelativeDate(3, 12, 15),
    modality: 'Presencial',
    location: 'Sala 1',
    status: 'Programada',
  },
  {
    id: 204,
    caseId: 101,
    title: 'Ratificación de prueba documental',
    date: createRelativeDate(8, 11, 0),
    modality: 'Virtual',
    location: 'Meet judicial',
    status: 'Programada',
  },
  {
    id: 205,
    caseId: 104,
    title: 'Cierre de mediación',
    date: createRelativeDate(-5, 15, 0),
    modality: 'Presencial',
    location: 'Centro de Mediación',
    status: 'Realizada',
  },
];

const documents = [
  {
    id: 301,
    hearingId: 201,
    caseId: 101,
    fileName: 'demanda_inicial.pdf',
    documentType: 'Demanda',
    uploadedAt: createRelativeDate(-10, 14, 20),
  },
  {
    id: 302,
    hearingId: 201,
    caseId: 101,
    fileName: 'prueba_documental.zip',
    documentType: 'Prueba',
    uploadedAt: createRelativeDate(-2, 8, 45),
  },
  {
    id: 303,
    hearingId: 202,
    caseId: 102,
    fileName: 'poliza_seguro.pdf',
    documentType: 'Anexo',
    uploadedAt: createRelativeDate(-1, 17, 10),
  },
  {
    id: 304,
    hearingId: 203,
    caseId: 103,
    fileName: 'inventario_bienes.docx',
    documentType: 'Inventario',
    uploadedAt: createRelativeDate(-4, 13, 5),
  },
];

const tasks = [
  {
    id: 401,
    title: 'Revisar estrategia de audiencia preliminar',
    completed: false,
    caseId: 101,
    dueDate: createRelativeDate(0, 8, 30),
  },
  {
    id: 402,
    title: 'Solicitar pericia complementaria',
    completed: false,
    caseId: 102,
    dueDate: createRelativeDate(2, 18, 0),
  },
  {
    id: 403,
    title: 'Actualizar carpeta sucesoria',
    completed: true,
    caseId: 103,
    dueDate: createRelativeDate(-1, 16, 30),
  },
];

const notifications = [
  {
    id: 501,
    title: 'Audiencia de hoy',
    message: 'La audiencia preliminar de Gonzalez c/ Lopez comienza a las 10:30.',
    read: false,
    createdAt: createRelativeDate(0, 7, 45),
  },
  {
    id: 502,
    title: 'Documento recibido',
    message: 'Se adjuntó la póliza de seguro en Fernandez c/ Seguros del Plata.',
    read: true,
    createdAt: createRelativeDate(-1, 18, 10),
  },
];

const metricas = {
  causasActivas: cases.filter((item) => item.status !== 'Cerrada').length,
  audienciasHoy: hearings.filter((item) => new Date(item.date).toDateString() === new Date().toDateString()).length,
  documentos: documents.length,
  tareasPendientes: tasks.filter((item) => !item.completed).length,
};

const mockData = {
  user,
  metricas,
  cases,
  hearings,
  documents,
  tasks,
  notifications,
};

export default mockData;
