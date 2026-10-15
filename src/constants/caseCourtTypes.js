export const CASE_COURT_TYPES = [
  { value: 'PENAL', label: 'Causa Penal (Criminal y Correccional)', shortLabel: 'Penal', icon: 'shield-outline', color: '#EF6461' },
  { value: 'CIVIL', label: 'Causa Civil', shortLabel: 'Civil', icon: 'scale-balance', color: '#4EA1FF' },
  { value: 'COMERCIAL', label: 'Causa Comercial', shortLabel: 'Comercial', icon: 'briefcase-outline', color: '#D8AA52' },
  { value: 'LABORAL', label: 'Causa Laboral', shortLabel: 'Laboral', icon: 'tools', color: '#F28C45' },
  { value: 'FAMILIA', label: 'Causa de Familia', shortLabel: 'Familia', icon: 'account-group-outline', color: '#A78BFA' },
  { value: 'CONTENCIOSO_ADMINISTRATIVO_TRIBUTARIO', label: 'Causa Contenciosa Administrativa / Tributaria', shortLabel: 'Contencioso', icon: 'bank-outline', color: '#35B8B0' },
  { value: 'FEDERAL', label: 'Causa Federal', shortLabel: 'Federal', icon: 'domain', color: '#58B889' },
];

export function getCaseCourtType(value) {
  return CASE_COURT_TYPES.find((item) => item.value === value) || {
    value: null,
    label: 'Fuero sin especificar',
    shortLabel: 'Sin fuero',
    icon: 'briefcase-outline',
    color: '#8C97A8',
  };
}
