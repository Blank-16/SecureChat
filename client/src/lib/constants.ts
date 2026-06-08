const isDev = import.meta.env.DEV;

export const API_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.startsWith("http") ? import.meta.env.VITE_API_URL : window.location.origin)
  : (isDev ? "http://localhost:4000" : window.location.origin);

const rawWsUrl = import.meta.env.VITE_WS_URL;

export const WS_URL = (() => {
  if (rawWsUrl) {
    if (rawWsUrl.startsWith("ws")) return rawWsUrl;
    if (rawWsUrl.startsWith("http")) return rawWsUrl.replace(/^http/, "ws");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${rawWsUrl.startsWith("/") ? "" : "/"}${rawWsUrl}`;
  }
  
  if (isDev) {
    return "ws://localhost:4000/ws";
  } else {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }
})();

export const RECONNECT_DELAY_MS = 3000;
export const TYPING_DEBOUNCE_MS = 1500;
export const KEY_FETCH_RETRIES = 8;
export const KEY_FETCH_INTERVAL_MS = 250;

