import OptionSheetSelector from './OptionSheetSelector';

export default function LegalStudySelector({
  studies = [],
  selectedLegalStudyId = null,
  onChange,
  label = 'Estudio Juridico',
  placeholder = 'Seleccionar estudio juridico',
  helperText,
  disabled = false,
}) {
  const selectedStudy = studies.find((item) => String(item?.id) === String(selectedLegalStudyId));

  return (
    <OptionSheetSelector
      disabled={disabled}
      helperText={helperText}
      label={label}
      onChange={(value) => onChange?.(value)}
      options={studies.map((study) => ({
        value: study.id,
        label: study.name,
        description:
          study.description ||
          `${study.membersCount || 0} miembros activos${study.currentUserRoleLabel ? ` · ${study.currentUserRoleLabel}` : ''}`,
        selected: String(study.id) === String(selectedLegalStudyId),
      }))}
      placeholder={placeholder}
      valueLabel={selectedStudy?.name || ''}
    />
  );
}
