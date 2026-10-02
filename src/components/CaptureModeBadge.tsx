import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IS_CAPTURE_MODE } from "../config/captureMode";

export default function CaptureModeBadge() {
  const insets = useSafeAreaInsets();

  if (!IS_CAPTURE_MODE) {
    return null;
  }

  return (
    <View
      accessibilityLabel="Modo captura activo"
      pointerEvents="none"
      style={[styles.badge, { top: Math.max(insets.top, 10) }]}
    >
      <Text style={styles.label}>MODO CAPTURA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: 12,
    zIndex: 1000,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f6cf65",
    backgroundColor: "#7a4b00",
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  label: {
    color: "#fff7d6",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
