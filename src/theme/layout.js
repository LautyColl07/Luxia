import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
};

export const RADII = {
  control: 14,
  button: 16,
  card: 22,
  hero: 28,
  pill: 999,
};

export const CARD_LAYOUT = {
  borderRadius: 24,
  iconRadius: 16,
  iconSize: 44,
  padding: 18,
};

export function getMetricCardHeight(layout) {
  if (layout.isDesktop) {
    return 178;
  }

  return layout.isCompact ? 142 : 158;
}

export const CONTROL_HEIGHT = 48;
export const CONTENT_MAX_WIDTH = 1120;
export const READING_MAX_WIDTH = 920;
export const FORM_MAX_WIDTH = 720;
export const COPY_MAX_WIDTH = 680;

export function useResponsiveLayout() {
  const { height, width } = useWindowDimensions();

  return useMemo(() => {
    const isCompact = width < 380;
    const isPhone = width < 600;
    const isTablet = width >= 600 && width < 1024;
    const isDesktop = width >= 1024;

    return {
      height,
      width,
      isCompact,
      isPhone,
      isTablet,
      isDesktop,
      gutter: isCompact ? 14 : isPhone ? 18 : 24,
      contentMaxWidth: CONTENT_MAX_WIDTH,
      readingMaxWidth: READING_MAX_WIDTH,
      formMaxWidth: FORM_MAX_WIDTH,
      copyMaxWidth: COPY_MAX_WIDTH,
      topSpacing: isPhone ? 20 : 28,
    };
  }, [height, width]);
}
