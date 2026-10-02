// Expo reemplaza las variables EXPO_PUBLIC_* al generar el bundle.
// La comparacion es intencionalmente estricta para que el modo normal sea el predeterminado.
export const IS_CAPTURE_MODE = process.env.EXPO_PUBLIC_CAPTURE_MODE === 'true';
