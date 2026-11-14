
import { getStore } from "@netlify/blobs";
import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const COOKIE_NAME = "pb_vault_session";
const SESSION_SECONDS = 12 * 60 * 60;

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/vault",
  maxAge: SESSION_SECONDS,
};

function passwordMatches(password: string): boolean {
  const stored = process.env.VAULT_ADMIN_PASSWORD_HASH || "";
  const parts = stored.split(":");

  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;

  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (salt.length !== 16 || expected.length !== 32) return false;

    const actual = pbkdf2Sync(password, salt, 600000, 32, "sha256");
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validCredentials(username: string, password: string) {
  const expected = process.env.VAULT_ADMIN_USERNAME || "";
  const a = Buffer.from(username);
  const b = Buffer.from(expected);

  const userMatches =
    expected.length > 0 &&
    a.length === b.length &&
    timingSafeEqual(a, b);

  const passMatches = passwordMatches(password);
  return userMatches && passMatches;
}

function secret(): string {
  const value = process.env.VAULT_SESSION_SECRET || "";
  if (value.length < 64) {
    throw new Error("VAULT_SESSION_SECRET is missing or too short");
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export async function createSession(): Promise<string> {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  const payload = `${expires}.${randomBytes(16).toString("hex")}`;
  await getStore("pentestblueprint-vault-sessions").set(nonceKey(payload), "active");
  return `${payload}.${sign(payload)}`;
}

function nonceKey(payload: string) { return `session/${payload.split(".")[1]}`; }

export async function revokeSession(token?: string): Promise<void> {
  if (!token || !(await validSession(token))) return;
  await getStore("pentestblueprint-vault-sessions").delete(nonceKey(token));
}

export async function validSession(token?: string): Promise<boolean> {
  if (!token) return false;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [expires, nonce, signature] = parts;
    if (!/^\d{13}$/.test(expires)) return false;
    if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
    if (Number(expires) <= Date.now()) return false;

    const expected = Buffer.from(sign(`${expires}.${nonce}`));
    const received = Buffer.from(signature);

    if (!(expected.length === received.length && timingSafeEqual(expected, received))) return false;
    return (await getStore("pentestblueprint-vault-sessions").get(nonceKey(token))) === "active";
  } catch {
    return false;
  }
}

