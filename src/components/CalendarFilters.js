import { StyleSheet, View } from 'react-native';

import { FilterChip, FilterPanel, FilterSection } from './FilterControls';
import StudyMembersDropdown from './StudyMembersDropdown';

export default function CalendarFilters({ filters, courtTypes, onChange, responsible }) {
  return (
    <FilterPanel>
      <FilterSection label="Tipo de evento">
        <View style={styles.chipRow}>
          <FilterChip label="Audiencias" selected={filters.hearings} multiple onPress={() => onChange({ hearings: !filters.hearings })} />
          <FilterChip label="Tareas" selected={filters.tasks} multiple onPress={() => onChange({ tasks: !filters.tasks })} />
        </View>
      </FilterSection>

      {filters.hearings ? (
        <FilterSection label="Fuero" divided>
          <View style={styles.chipRow}>
            <FilterChip label="Todas" selected={filters.court === 'all'} onPress={() => onChange({ court: 'all' })} />
            {courtTypes.map((court) => (
              <FilterChip key={court.value} label={court.shortLabel} selected={filters.court === court.value} onPress={() => onChange({ court: court.value })} />
            ))}
          </View>
        </FilterSection>
      ) : null}

      {responsible ? (
        <FilterSection label="Responsables" divided>
          <StudyMembersDropdown {...responsible} label="Responsables" emptyLabel="Todos" includeAll style={styles.responsibleControl} />
        </FilterSection>
      ) : null}
    </FilterPanel>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  responsibleControl: { maxWidth: 380 },
});
