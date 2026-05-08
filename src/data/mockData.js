function createRelativeDate(daysOffset, hours, minutes) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const user = {
  id: 'mock-owner-user',
  firebaseUid: 'mock-owner-user',
  name: 'Camila Perez',
  email: 'camila.perez@luxia.com',
  role: 'Socia directora',
};

const users = [
  user,
  {
    id: 'mock-admin-user',
    firebaseUid: 'mock-admin-user',
    name: 'Martin Gomez',
    email: 'martin.gomez@luxia.com',
    role: 'Abogado senior',
  },
  {
    id: 'mock-member-user',
    firebaseUid: 'mock-member-user',
    name: 'Lucia Benitez',
    email: 'lucia.benitez@luxia.com',
    role: 'Abogada asociada',
  },
  {
    id: 'mock-viewer-user',
    firebaseUid: 'mock-viewer-user',
    name: 'Nicolas Rivas',
    email: 'nicolas.rivas@luxia.com',
    role: 'Analista paralegal',
  },
  {
    id: 'mock-pending-user',
    firebaseUid: 'mock-pending-user',
    name: 'Sofia Torres',
    email: 'sofia.torres@luxia.com',
    role: 'Invitada',
  },
];

const legalStudies = [
  {
    id: 'ls-perez-asociados',
    name: 'Estudio Perez & Asociados',
    description: 'Litigios civiles, comerciales y coordinacion de audiencias.',
    ownerId: user.id,
    createdAt: createRelativeDate(-90, 10, 0),
    updatedAt: createRelativeDate(-1, 18, 5),
  },
  {
    id: 'ls-gomez-legal',
    name: 'Workspace Juridico Gomez Legal',
    description: 'Seguimiento laboral y documental para equipos distribuidos.',
    ownerId: 'mock-admin-user',
    createdAt: createRelativeDate(-45, 9, 15),
    updatedAt: createRelativeDate(-2, 11, 20),
  },
];

const legalStudyMembers = [
  {
    id: 'lsm-1',
    userId: user.id,
    legalStudyId: 'ls-perez-asociados',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: createRelativeDate(-90, 10, 10),
    updatedAt: createRelativeDate(-1, 18, 5),
  },
  {
    id: 'lsm-2',
    userId: 'mock-admin-user',
    legalStudyId: 'ls-perez-asociados',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: createRelativeDate(-75, 12, 0),
    updatedAt: createRelativeDate(-3, 14, 25),
  },
  {
    id: 'lsm-3',
    userId: 'mock-member-user',
    legalStudyId: 'ls-perez-asociados',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: createRelativeDate(-60, 15, 30),
    updatedAt: createRelativeDate(-4, 9, 50),
  },
  {
    id: 'lsm-4',
    userId: 'mock-viewer-user',
    legalStudyId: 'ls-perez-asociados',
    role: 'VIEWER',
    status: 'ACTIVE',
    createdAt: createRelativeDate(-30, 9, 45),
    updatedAt: createRelativeDate(-8, 16, 15),
  },
  {
    id: 'lsm-5',
    userId: user.id,
    legalStudyId: 'ls-gomez-legal',
    role: 'MEMBER',
    status: 'ACTIVE',
    createdAt: createRelativeDate(-35, 11, 0),
    updatedAt: createRelativeDate(-2, 11, 20),
  },
  {
    id: 'lsm-6',
    userId: 'mock-pending-user',
    legalStudyId: 'ls-gomez-legal',
    role: 'VIEWER',
    status: 'PENDING',
    createdAt: createRelativeDate(-1, 9, 0),
    updatedAt: createRelativeDate(-1, 9, 0),
  },
];

const cases = [
  {
    id: 101,
    title: 'Gonzalez c/ Lopez',
    description: 'Reclamo por incumplimiento contractual y danos emergentes.',
    status: 'Activa',
    court: 'Juzgado Civil N 12',
    ownerUserId: user.id,
    scope: 'PRIVATE',
    legalStudyId: null,
    createdAt: createRelativeDate(-18, 9, 30),
    updatedAt: createRelativeDate(-1, 12, 10),
  },
  {
    id: 102,
    title: 'Fernandez c/ Seguros del Plata',
    description: 'Cobertura denegada en siniestro automotor.',
    status: 'En revision',
    court: 'Camara Comercial Sala B',
    ownerUserId: user.id,
    scope: 'LEGAL_STUDY',
    legalStudyId: 'ls-perez-asociados',
    createdAt: createRelativeDate(-12, 11, 15),
    updatedAt: createRelativeDate(-1, 17, 45),
  },
  {
    id: 103,
    title: 'Sucesion Ramirez',
    description: 'Seguimiento de declaratoria y distribucion patrimonial.',
    status: 'Activa',
    court: 'Juzgado de Familia N 4',
    ownerUserId: 'mock-member-user',
    scope: 'LEGAL_STUDY',
    legalStudyId: 'ls-perez-asociados',
    createdAt: createRelativeDate(-7, 10, 0),
    updatedAt: createRelativeDate(0, 8, 20),
  },
  {
    id: 104,
    title: 'Mendoza c/ Consorcio Belgrano 441',
    description: 'Mediacion por expensas y vicios en mantenimiento.',
    status: 'Cerrada',
    court: 'Centro de Mediacion CABA',
    ownerUserId: user.id,
    scope: 'PRIVATE',
    legalStudyId: null,
    createdAt: createRelativeDate(-32, 16, 45),
    updatedAt: createRelativeDate(-5, 15, 10),
  },
  {
    id: 105,
    title: 'Perez s/ Danos y Perjuicios',
    description: 'Seguimiento compartido del equipo laboral con estrategia documental.',
    status: 'Activa',
    court: 'Juzgado Laboral N 8',
    ownerUserId: user.id,
    scope: 'LEGAL_STUDY',
    legalStudyId: 'ls-gomez-legal',
    createdAt: createRelativeDate(-3, 14, 5),
    updatedAt: createRelativeDate(0, 9, 35),
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
    title: 'Conciliacion con aseguradora',
    date: createRelativeDate(1, 9, 0),
    modality: 'Virtual',
    location: 'Zoom institucional',
    status: 'Programada',
  },
  {
    id: 203,
    caseId: 103,
    title: 'Presentacion de herederos',
    date: createRelativeDate(3, 12, 15),
    modality: 'Presencial',
    location: 'Sala 1',
    status: 'Programada',
  },
  {
    id: 204,
    caseId: 105,
    title: 'Audiencia de danos',
    date: createRelativeDate(5, 11, 0),
    modality: 'Virtual',
    location: 'Meet judicial',
    status: 'Programada',
  },
  {
    id: 205,
    caseId: 104,
    title: 'Cierre de mediacion',
    date: createRelativeDate(-5, 15, 0),
    modality: 'Presencial',
    location: 'Centro de Mediacion',
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
    hearingId: 202,
    caseId: 102,
    fileName: 'prueba_documental.zip',
    documentType: 'Prueba',
    uploadedAt: createRelativeDate(-2, 8, 45),
  },
  {
    id: 303,
    hearingId: 203,
    caseId: 103,
    fileName: 'poliza_seguro.pdf',
    documentType: 'Anexo',
    uploadedAt: createRelativeDate(-1, 17, 10),
  },
  {
    id: 304,
    hearingId: 204,
    caseId: 105,
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
    message: 'Se adjunto una poliza de seguro en Fernandez c/ Seguros del Plata.',
    read: true,
    createdAt: createRelativeDate(-1, 18, 10),
  },
  {
    id: 503,
    title: 'Actividad del estudio',
    message: 'Lucia Benitez actualizo la causa Perez s/ Danos y Perjuicios.',
    read: false,
    createdAt: createRelativeDate(0, 8, 50),
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
  users,
  metricas,
  legalStudies,
  legalStudyMembers,
  cases,
  hearings,
  documents,
  tasks,
  notifications,
};

export default mockData;
