import EmptyState from './EmptyState';

export default function EmptyActivityState() {
  return (
    <EmptyState
      icon="history"
      message="Cuando crees causas, audiencias, tareas o documentos, apareceran aca."
      title="Todavía no hay actividad registrada."
    />
  );
}
