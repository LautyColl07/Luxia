import { WORK_CONTEXT_TYPES } from '../services/api';
import OptionSheetSelector from './OptionSheetSelector';

function getWorkContextLabel(activeContext, studies = []) {
  if (activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY) {
    return studies.find((item) => String(item?.id) === String(activeContext?.legalStudyId))?.name || 'Estudio Juridico';
  }

  if (activeContext?.type === WORK_CONTEXT_TYPES.ALL) {
    return 'Todas las causas';
  }

  return 'Personal';
}

export default function WorkContextSelector({
  activeContext,
  studies = [],
  onChange,
  label = 'Trabajando como',
}) {
  const options = [
    {
      key: 'personal',
      value: { type: WORK_CONTEXT_TYPES.PERSONAL },
      label: 'Personal',
      description: 'Tus causas privadas y visibles solo para vos.',
      selected: activeContext?.type === WORK_CONTEXT_TYPES.PERSONAL,
    },
    ...studies.map((study) => ({
      key: `study-${study.id}`,
      value: { type: WORK_CONTEXT_TYPES.LEGAL_STUDY, legalStudyId: study.id },
      label: study.name,
      description:
        study.description ||
        `Workspace juridico · ${study.currentUserRoleLabel || 'Miembro'}${study.capabilities?.isReadOnly ? ' · Solo lectura' : ''}`,
      selected:
        activeContext?.type === WORK_CONTEXT_TYPES.LEGAL_STUDY &&
        String(activeContext?.legalStudyId) === String(study.id),
    })),
    {
      key: 'all',
      value: { type: WORK_CONTEXT_TYPES.ALL },
      label: 'Todas las causas',
      description: 'Combina causas personales y causas de todos tus estudios juridicos.',
      selected: activeContext?.type === WORK_CONTEXT_TYPES.ALL,
    },
  ];

  return (
    <OptionSheetSelector
      label={label}
      onChange={(value) => onChange?.(value)}
      options={options}
      valueLabel={getWorkContextLabel(activeContext, studies)}
    />
  );
}
