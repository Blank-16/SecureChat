export function formatTime(timestamp: string): string {
  let ts = timestamp;
  if (!ts.includes("T")) {
    ts = ts.replace(" ", "T");
  }
  const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
  if (isNaN(d.getTime())) return "??:??";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
