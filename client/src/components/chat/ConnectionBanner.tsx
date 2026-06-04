import type { ConnectionStatus } from "../../types";
import { Spinner } from "../ui/Spinner";

const STATUS_LABEL: Record<Exclude<ConnectionStatus, "connected">, string> = {
  connecting: "Connecting…",
  disconnected: "Reconnecting…",
  error: "Connection error — retrying…",
};

interface Props {
  status: ConnectionStatus;
}

export function ConnectionBanner({ status }: Props) {
  if (status === "connected") return null;
  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2 animate-fade-in shrink-0">
      <Spinner className="size-3.5 text-yellow-500" />
      <p className="text-xs text-yellow-400">{STATUS_LABEL[status]}</p>
    </div>
  );
}
