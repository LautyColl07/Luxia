import { Sparkles } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../context/ThemeContext';

export default function LuxAssistantButton({ onPress }) {
  const { colors } = useAppTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.06],
  });

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          {
            backgroundColor: colors.primary,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.animatedButton,
          {
            transform: [{ scale }],
          },
        ]}
      >
        <Pressable
          accessibilityLabel="Abrir asistente LUX"
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primaryDeep,
              borderColor: 'rgba(201, 179, 140, 0.45)',
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Sparkles color="#C9B38C" size={22} strokeWidth={2} />
          <Text style={styles.label}>LUX</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  animatedButton: {
    shadowColor: '#071C33',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 12,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
