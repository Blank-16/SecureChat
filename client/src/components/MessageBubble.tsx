import type { Message } from "../types";
import { SendStatusIcon } from "./chat/SendStatusIcon";
import { formatTime } from "../lib/formatTime";

interface Props {
  message: Message;
  isSelf: boolean;
}

export function MessageBubble({ message, isSelf }: Props) {
  const content = message.plaintext ?? null;

  return (
    <div
      data-self={isSelf || undefined}
      className="flex animate-slide-up data-[self]:justify-end not-data-[self]:justify-start"
    >
      <div
        data-self={isSelf || undefined}
        className="max-w-[70%] flex flex-col gap-1 data-[self]:items-end not-data-[self]:items-start"
      >
        <div
          data-self={isSelf || undefined}
          data-error={message.decryptError || undefined}
          data-failed={message.sendStatus === "failed" || undefined}
          className={[
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words transition-opacity",
            "data-[self]:bg-accent data-[self]:text-white data-[self]:rounded-br-sm",
            "not-data-[self]:bg-surface-600 not-data-[self]:text-zinc-200 not-data-[self]:rounded-bl-sm",
            "data-[error]:opacity-50 data-[error]:italic",
            "data-[failed]:bg-red-900/40 data-[failed]:text-red-200",
          ].join(" ")}
        >
          {message.decryptError ? (
            <span className="text-zinc-400 text-xs">Failed to decrypt</span>
          ) : content === null ? (
            <span className="inline-flex gap-1 items-center">
              <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse" />
              <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse [animation-delay:0.2s]" />
              <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse [animation-delay:0.4s]" />
            </span>
          ) : content}
        </div>

        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-zinc-600">{formatTime(message.timestamp)}</span>
          {isSelf && <SendStatusIcon status={message.sendStatus} />}
        </div>
      </div>
    </div>
  );
}
