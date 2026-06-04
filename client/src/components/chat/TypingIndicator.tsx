export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="bg-surface-600 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
        <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse" />
        <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse [animation-delay:0.2s]" />
        <span className="size-1.5 rounded-full bg-zinc-500 animate-pulse [animation-delay:0.4s]" />
      </div>
    </div>
  );
}
