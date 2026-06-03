interface Props {
  username: string;
  online?: boolean;
  size?: "sm" | "md";
}

export function Avatar({ username, online, size = "md" }: Props) {
  const dim = size === "sm" ? "size-7" : "size-8";
  return (
    <div className="relative shrink-0">
      <div className={`${dim} rounded-full bg-surface-500 flex items-center justify-center text-xs font-semibold text-zinc-300 uppercase`}>
        {username.charAt(0)}
      </div>
      {online !== undefined && (
        <span className={[
          "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface-800",
          online ? "bg-emerald-500" : "bg-zinc-600",
        ].join(" ")} />
      )}
    </div>
  );
}
