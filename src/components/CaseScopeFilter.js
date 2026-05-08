import OptionSheetSelector from './OptionSheetSelector';

const OPTIONS = [
  {
    value: 'private',
    label: 'Mis causas particulares',
    description: 'Solo visibles para tu cuenta.',
  },
  {
    value: 'legal_study',
    label: 'Causas del Estudio Juridico',
    description: 'Expedientes compartidos segun membresia y permisos.',
  },
  {
    value: 'all',
    label: 'Todas las causas',
    description: 'Combina tus causas privadas y las de tus estudios.',
  },
];

export default function CaseScopeFilter({
  value = 'all',
  onChange,
  label = 'Vista de causas',
}) {
  const selectedOption = OPTIONS.find((item) => item.value === value);

  return (
    <OptionSheetSelector
      label={label}
      onChange={(nextValue) => onChange?.(nextValue)}
      options={OPTIONS.map((item) => ({
        ...item,
        selected: item.value === value,
      }))}
      valueLabel={selectedOption?.label || 'Todas las causas'}
    />
  );
}
