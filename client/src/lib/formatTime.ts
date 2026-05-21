export function formatTime(timestamp: string): string {
  const d = new Date(timestamp.endsWith("Z") ? timestamp : timestamp + "Z");
  if (isNaN(d.getTime())) return "??:??";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
