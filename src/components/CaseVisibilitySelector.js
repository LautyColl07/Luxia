import { CASE_SCOPES } from '../services/api';
import OptionSheetSelector from './OptionSheetSelector';

const OPTIONS = [
  {
    value: CASE_SCOPES.PRIVATE,
    label: 'Particular',
    description: 'Solo vos podes ver esta causa.',
  },
  {
    value: CASE_SCOPES.LEGAL_STUDY,
    label: 'Estudio Juridico',
    description: 'Esta causa pertenece al Estudio Juridico seleccionado.',
  },
];

export default function CaseVisibilitySelector({
  value = CASE_SCOPES.PRIVATE,
  onChange,
  disabledShared = false,
  helperText,
}) {
  const selectedOption = OPTIONS.find((item) => item.value === value);

  return (
    <OptionSheetSelector
      helperText={helperText}
      label="Visibilidad de la causa"
      onChange={(nextValue) => onChange?.(nextValue)}
      options={OPTIONS.map((item) => ({
        ...item,
        disabled: item.value === CASE_SCOPES.LEGAL_STUDY && disabledShared,
        selected: item.value === value,
      }))}
      valueLabel={selectedOption?.label || 'Particular'}
    />
  );
}
