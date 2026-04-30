import type { IncomingMessage } from "http";

export const COOKIE_NAME = "sc_session";
const IS_PROD = process.env.NODE_ENV === "production";

export function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((pair) => {
      const [k, ...v] = pair.trim().split("=");
      return [k.trim(), decodeURIComponent(v.join("="))];
    }),
  );
}

export function buildSetCookieHeader(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(IS_PROD ? ["Secure"] : []),
  ].join("; ");
}

export function buildClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function getSessionTokenFromRequest(
  req: IncomingMessage,
): string | null {
  const cookies = parseCookies(req.headers.cookie ?? "");
  return cookies[COOKIE_NAME] ?? null;
}
