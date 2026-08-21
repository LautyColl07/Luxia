import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import React, { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { getColorsForScheme } from "../constants/colors";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  colors: ReturnType<typeof getColorsForScheme>;
  isDark: boolean;
  navigationTheme: typeof DefaultTheme;
  resolvedTheme: ResolvedTheme;
  themePreference: ThemePreference;
  setThemePreference: (nextTheme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: getColorsForScheme("light"),
  isDark: false,
  navigationTheme: DefaultTheme,
  resolvedTheme: "light",
  themePreference: "system",
  setThemePreference: () => undefined,
});

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  const resolvedTheme: ResolvedTheme =
    themePreference === "system"
      ? systemColorScheme === "dark"
        ? "dark"
        : "light"
      : themePreference;

  const colors = useMemo(() => getColorsForScheme(resolvedTheme), [resolvedTheme]);
  const navigationTheme = useMemo(
    () => ({
      ...(resolvedTheme === "dark" ? DarkTheme : DefaultTheme),
      dark: resolvedTheme === "dark",
      colors: {
        ...(resolvedTheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
        notification: colors.warning,
      },
    }),
    [colors, resolvedTheme]
  );

  const value = useMemo(
    () => ({
      colors,
      isDark: resolvedTheme === "dark",
      navigationTheme,
      resolvedTheme,
      themePreference,
      setThemePreference,
    }),
    [colors, navigationTheme, resolvedTheme, themePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
