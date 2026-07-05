import type { AuthResponse, User } from "shared-types";
import { post, get } from "./api.js";

const TOKEN_KEY = "metaverse_token";
const USER_KEY = "metaverse_user";

function storeAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  const res = await post<AuthResponse>("/api/auth/google", { credential });
  storeAuth(res.token, res.user);
  return res;
}

export async function devLogin(displayName: string): Promise<AuthResponse> {
  const res = await post<AuthResponse>("/api/auth/dev-login", { displayName });
  storeAuth(res.token, res.user);
  return res;
}

export async function fetchMe(token: string): Promise<User> {
  const user = await get<User>("/api/auth/me", token);
  storeAuth(token, user);
  return user;
}

export type AuthEventHandler = (user: User | null) => void;
const listeners = new Set<AuthEventHandler>();

export function onAuthChange(fn: AuthEventHandler) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyAuthChange(user: User | null) {
  listeners.forEach((fn) => fn(user));
}
