export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const wsUrl = import.meta.env.VITE_WS_URL ?? API_URL;

if (!wsUrl) {
  throw new Error("VITE_WS_URL is not set. Add it to your .env file.");
}

export const WS_URL = wsUrl.replace(/^http/, "ws");
export const RECONNECT_DELAY_MS = 3000;
export const TYPING_DEBOUNCE_MS = 1500;
export const KEY_FETCH_RETRIES = 8;
export const KEY_FETCH_INTERVAL_MS = 250;
