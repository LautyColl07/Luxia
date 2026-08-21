import EmptyState from './EmptyState';

export default function EmptyActivityState() {
  return (
    <EmptyState
      icon="history"
      message="Cuando crees causas, audiencias, tareas o documentos, apareceran aca."
      title="No hay actividad registrada todavia"
    />
  );
}
