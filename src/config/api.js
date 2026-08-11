const publicUrls = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_AI_URL: process.env.EXPO_PUBLIC_AI_URL,
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
    throw new Error(`${environmentKey} debe usar HTTPS para proteger los datos juridicos.`);
  }

  return value;
}

// Las URLs se inyectan al compilar. No se incluyen IPs ni endpoints HTTP en la app.
export const API_ROOT_URL = getRequiredHttpsUrl("EXPO_PUBLIC_API_URL");
export const API_BASE_URL = `${API_ROOT_URL}/api/v1`;
export const AI_BASE_URL = getRequiredHttpsUrl("EXPO_PUBLIC_AI_URL");
export const SOCKET_URL = API_ROOT_URL;
