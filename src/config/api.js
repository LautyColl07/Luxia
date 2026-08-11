const publicUrls = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
};

function getRequiredHttpsUrl(environmentKey) {
  const value = String(publicUrls[environmentKey] || "").trim().replace(/\/+$/, "");

  if (!value) {
    throw new Error(`${environmentKey} es obligatoria y debe usar HTTPS.`);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${environmentKey} no contiene una URL valida.`);
  }

  if (parsedUrl.protocol !== "https:") {
    if (typeof __DEV__ !== "undefined" && __DEV__ && parsedUrl.protocol === "http:") {
      console.warn(`${environmentKey} usa HTTP solo para desarrollo. Configura HTTPS antes de generar una compilacion.`);
      return value;
    }

    throw new Error(`${environmentKey} debe usar HTTPS para proteger los datos juridicos.`);
  }

  return value;
}

// Las URLs se inyectan al compilar. No se incluyen IPs ni endpoints HTTP en la app.
export const API_ROOT_URL = getRequiredHttpsUrl("EXPO_PUBLIC_API_URL");
export const API_BASE_URL = `${API_ROOT_URL}/api/v1`;
// La app no contacta servicios de IA directamente: todo pasa por la API autenticada.
export const AI_BASE_URL = "";
export const SOCKET_URL = API_ROOT_URL;
