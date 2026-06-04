import { useState, type KeyboardEvent, type ChangeEvent } from "react";
import { Spinner } from "./ui/Spinner";
import { ErrorMessage } from "./ui/ErrorMessage";
import { useTypingDebounce } from "../hooks/useTypingDebounce";

interface Props {
  onSend: (text: string) => Promise<boolean>;
  onTypingChange: (isTyping: boolean) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTypingChange, disabled }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const { onInput, onStop } = useTypingDebounce(onTypingChange);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setSendError("");
    onInput();
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) return;
    setSending(true);
    setSendError("");
    onStop();

    const ok = await onSend(trimmed);
    if (ok) {
      setValue("");
    } else {
      setSendError("Failed to send. Recipient key unavailable.");
    }
    setSending(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="px-4 py-3 border-t border-surface-600 bg-surface-800">
      {sendError && <div className="mb-2"><ErrorMessage message={sendError} /></div>}

      <div className="flex items-end gap-2 bg-surface-700 rounded-xl border border-surface-500 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-all px-3 py-2">
        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={disabled ? "Select a conversation…" : "Message (Enter to send)"}
          rows={1}
          className="flex-1 bg-transparent resize-none text-sm text-white placeholder-zinc-600 focus:outline-none max-h-32 overflow-y-auto leading-relaxed py-1 disabled:cursor-not-allowed field-sizing-content"
        />
        <button
          onClick={() => void submit()}
          disabled={disabled || !value.trim() || sending}
          className="shrink-0 p-1.5 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all mb-0.5 cursor-pointer"
        >
          {sending ? (
            <Spinner className="size-4 text-white" />
          ) : (
            <svg className="size-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-[10px] text-zinc-700 mt-1.5 text-center">
        Messages are encrypted before leaving your device
      </p>
    </div>
  );
}
