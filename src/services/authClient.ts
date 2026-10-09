import { localAuth, LocalSession } from "./localAuth";
import { getUsernameValidationError, resolveRegisterUsername } from "../utils/auth";

export type LoginPayload = { identifier: string; password: string; rememberMe: boolean };
export type RegisterPayload = {
  firstName: string; lastName: string; email: string; username: string; password: string;
  matricula?: string; estudioJuridico?: string; enrollment?: string; lawFirm?: string;
};
export const authClient = {
  async login(payload: LoginPayload) {
    if (!payload.identifier.trim() || !payload.password) throw new Error("Completa tu email o usuario y la contrasena.");
    return { ok: true, mode: "local" as const, user: await localAuth.login(payload) };
  },
  async register(payload: RegisterPayload) {
    if (!payload.firstName || !payload.lastName || !payload.email) throw new Error("Completa los datos obligatorios para crear la cuenta.");
    const username = resolveRegisterUsername(payload);
    const error = getUsernameValidationError(username);
    if (error) throw new Error(error);
    return { ok: true, mode: "local" as const, ...await localAuth.register({ ...payload, username }) };
  },
  async completeLocalRegistration(value: LocalSession) { return localAuth.acceptSession(value, false); },
  async logout() { return localAuth.signOut(); },
  async resetPassword(email: string, recoveryCode = "", password = "") {
    if (!email.trim() || !recoveryCode.trim() || password.length < 8) throw new Error("Ingresa tu email, el codigo de recuperacion y una nueva contrasena de al menos 8 caracteres.");
    return { ok: true, mode: "local" as const, ...await localAuth.resetPassword(email.trim(), recoveryCode.trim(), password) };
  },
};
