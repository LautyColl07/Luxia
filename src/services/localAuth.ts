import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE_URL } from "../config/api";

export type LocalUser = { uid: string; email: string | null; displayName: string | null; getIdToken: (refresh?: boolean) => Promise<string> };
export type LocalSession = { token: string; expiresAt: string; user: { id: string; email: string | null; name: string | null }; recoveryCode?: string };
const KEY = "luxia.localSession.v1";
const listeners = new Set<(user: LocalUser | null) => void>();
let session: LocalSession | null = null;
let currentUser: LocalUser | null = null;
let restored: Promise<void> | null = null;
let revision = 0;

function normalizeSession(value: any): LocalSession {
  const data = value?.data || value;
  const profile = data?.user || value?.user;
  const token = data?.token || data?.accessToken || value?.token;
  const id = profile?.id || profile?.uid || profile?.userId;
  if (typeof token !== "string" || !/^[\x21-\x7e]{20,8192}$/.test(token) || !id) {
    throw new Error("El servidor no devolvio una sesion local valida. Revisa su respuesta de login.");
  }
  const expiresAt = data?.expiresAt || new Date(Date.now() + 86400000).toISOString();
  if (!Number.isFinite(Date.parse(expiresAt))) throw new Error("El servidor devolvio una fecha de sesion invalida.");
  return { token, expiresAt, user: { id: String(id), email: profile.email || null, name: profile.name || profile.displayName || null }, recoveryCode: data?.recoveryCode };
}
function publish(value: LocalSession | null) {
  session = value;
  currentUser = value ? { uid: value.user.id, email: value.user.email, displayName: value.user.name, async getIdToken() {
    if (!session || session.user.id !== value.user.id) throw Object.assign(new Error("Inicia sesion nuevamente."), { status: 401 });
    if (Date.parse(session.expiresAt) <= Date.now()) {
      void localAuth.signOut();
      throw Object.assign(new Error("Tu sesion expiro. Inicia sesion nuevamente."), { status: 401 });
    }
    return session.token;
  } } : null;
  listeners.forEach((listener) => listener(currentUser));
}
async function clearStorage() {
  await AsyncStorage.removeItem(KEY);
  if (Platform.OS === "web") { try { globalThis.sessionStorage?.removeItem(KEY); } catch { /* Restricted browser. */ } }
}
async function send(endpoint: string, body?: unknown, token?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_BASE_URL + "/auth/local/" + endpoint, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : data.error?.message || data.message;
      throw Object.assign(new Error(response.status === 404
        ? "El servidor todavia no tiene instalada esta funcion de acceso local."
        : message || "No se pudo completar la operacion en el servidor local."), { status: response.status });
    }
    return data;
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    throw new Error("No pudimos conectarnos al servidor local. Conectate a su red por Wi-Fi o cable; no hace falta internet.");
  } finally { clearTimeout(timer); }
}
export const localAuth = {
  get currentUser() { return currentUser; },
  subscribe(listener: (user: LocalUser | null) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  restore() {
    if (restored) return restored;
    const initial = revision;
    restored = (async () => {
      let raw: string | null = null;
      if (Platform.OS === "web") { try { raw = globalThis.sessionStorage?.getItem(KEY) || null; } catch { /* Restricted browser. */ } }
      raw ||= await AsyncStorage.getItem(KEY);
      if (revision !== initial) return;
      const saved = raw ? normalizeSession(JSON.parse(raw)) : null;
      if (saved && Date.parse(saved.expiresAt) > Date.now()) publish(saved);
      else { await clearStorage(); if (revision === initial) publish(null); }
    })().catch(async () => { await clearStorage().catch(() => undefined); if (revision === initial) publish(null); });
    return restored;
  },
  async acceptSession(value: LocalSession, rememberMe: boolean) {
    revision += 1;
    const normalized = normalizeSession(value);
    const saved = { token: normalized.token, expiresAt: normalized.expiresAt, user: normalized.user };
    await clearStorage();
    if (rememberMe) await AsyncStorage.setItem(KEY, JSON.stringify(saved));
    else if (Platform.OS === "web") { try { globalThis.sessionStorage?.setItem(KEY, JSON.stringify(saved)); } catch { /* In-memory session. */ } }
    publish(saved);
    return currentUser;
  },
  async login(payload: { identifier: string; password: string; rememberMe: boolean }) {
    const identifier = payload.identifier.trim();
    return this.acceptSession(normalizeSession(await send("login", {
      ...payload, identifier, ...(identifier.includes("@") ? { email: identifier.toLowerCase() } : { username: identifier }),
    })), payload.rememberMe);
  },
  async register(payload: unknown): Promise<LocalSession> { return normalizeSession(await send("register", payload)); },
  async signOut() {
    const token = session?.token;
    revision += 1; publish(null);
    await clearStorage().catch(() => undefined);
    if (token) await send("logout", {}, token).catch(() => undefined);
  },
  async resetPassword(email: string, recoveryCode: string, password: string): Promise<{ message: string; recoveryCode?: string }> {
    return send("reset-password", { email, recoveryCode, password });
  },
  async rotateRecoveryCode(): Promise<{ recoveryCode: string }> {
    const token = await currentUser?.getIdToken();
    if (!token) throw new Error("Inicia sesion para generar el codigo.");
    return send("recovery-code", {}, token);
  },
};
