const app = require('./apiApp');
const prisma = require('./lib/prisma');

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(`Luxia backend escuchando en http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
