export type AppColors = {
  primary: string;
  primaryDeep: string;
  primaryHover: string;
  background: string;
  backgroundAlt: string;
  card: string;
  cardElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  border: string;
  borderSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;
  neutralSoft: string;
  mutedIcon: string;
  calendarMuted: string;
  legendText: string;
  weekdayText: string;
  inputBackground: string;
  shadow: string;
  white: string;
};

export const lightColors: AppColors;
export const darkColors: AppColors;
export function getColorsForScheme(scheme?: "light" | "dark"): AppColors;

declare const colors: AppColors;
export default colors;
