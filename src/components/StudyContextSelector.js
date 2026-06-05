import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useStudyContext } from '../context/StudyContext';
import { useAppTheme } from '../context/ThemeContext';

export default function StudyContextSelector({ inverse = false }) {
  const { colors } = useAppTheme();
  const {
    activeContext,
    isLoadingStudies,
    legalStudies,
    selectPersonalContext,
    selectStudyContext,
  } = useStudyContext();
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => createStyles(colors, inverse), [colors, inverse]);
  const isStudy = activeContext.type === 'study';
  const label = isStudy ? activeContext.name : 'Mis Casos';
  const icon = isStudy ? 'office-building-outline' : 'account-outline';

  const closeMenu = () => setOpen(false);

  const handlePersonalPress = () => {
    selectPersonalContext();
    closeMenu();
  };

  const handleStudyPress = (study) => {
    selectStudyContext(study);
    closeMenu();
  };

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => setOpen((current) => !current)} style={styles.trigger}>
        <MaterialCommunityIcons color={styles.triggerIcon.color} name={icon} size={18} />
        <Text numberOfLines={1} style={styles.triggerText}>{label}</Text>
        <MaterialCommunityIcons
          color={styles.triggerIcon.color}
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
        />
      </Pressable>

      {open ? (
        <View style={styles.menu}>
          <Text style={styles.menuEyebrow}>Contexto</Text>

          <Option
            colors={colors}
            icon="account-outline"
            label="Mis Casos"
            onPress={handlePersonalPress}
            selected={!isStudy}
            styles={styles}
          />

          {legalStudies.map((study) => (
            <Option
              colors={colors}
              icon="office-building-outline"
              key={study.id}
              label={study.name}
              onPress={() => handleStudyPress(study)}
              selected={isStudy && String(activeContext.legalStudyId) === String(study.id)}
              styles={styles}
            />
          ))}

          {isLoadingStudies ? (
            <Text style={styles.loadingText}>Actualizando estudios...</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Option({ colors, icon, label, onPress, selected, styles }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, selected && styles.optionActive]}>
      <MaterialCommunityIcons
        color={selected ? colors.textOnPrimary : colors.primary}
        name={icon}
        size={18}
      />
      <Text numberOfLines={1} style={[styles.optionText, selected && styles.optionTextActive]}>
        {label}
      </Text>
      {selected ? (
        <MaterialCommunityIcons color={colors.textOnPrimary} name="check" size={16} />
      ) : null}
    </Pressable>
  );
}

const createStyles = (colors, inverse) => {
  const foreground = inverse ? colors.textOnPrimary : colors.text;
  const triggerBackground = inverse ? 'rgba(255,255,255,0.13)' : colors.card;
  const triggerBorder = inverse ? 'rgba(255,255,255,0.18)' : colors.borderSoft;

  return StyleSheet.create({
    wrapper: {
      position: 'relative',
      zIndex: 50,
      alignSelf: 'flex-end',
    },
    triggerIcon: {
      color: foreground,
    },
    trigger: {
      minWidth: 156,
      maxWidth: 230,
      minHeight: 42,
      borderRadius: 18,
      paddingHorizontal: 12,
      backgroundColor: triggerBackground,
      borderWidth: 1,
      borderColor: triggerBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    triggerText: {
      flex: 1,
      color: foreground,
      fontSize: 13,
      fontWeight: '800',
    },
    menu: {
      position: 'absolute',
      top: 48,
      right: 0,
      width: 250,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.24,
      shadowRadius: 22,
      elevation: 10,
      zIndex: 99,
    },
    menuEyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingTop: 4,
      paddingBottom: 6,
      textTransform: 'uppercase',
    },
    option: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    optionActive: {
      backgroundColor: colors.primary,
    },
    optionText: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    optionTextActive: {
      color: colors.textOnPrimary,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
  });
};
