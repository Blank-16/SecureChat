import { useRef, useCallback, useEffect, useMemo } from "react";
import { TYPING_DEBOUNCE_MS } from "../lib/constants";

export function useTypingDebounce(onTypingChange: (isTyping: boolean) => void) {
  const typingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTypingChangeRef = useRef(onTypingChange);

  // Keep callback reference updated without triggering re-creation of useCallback
  useEffect(() => {
    onTypingChangeRef.current = onTypingChange;
  }, [onTypingChange]);

  const onInput = useCallback(() => {
    if (!typingRef.current) {
      typingRef.current = true;
      onTypingChangeRef.current(true);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      typingRef.current = false;
      onTypingChangeRef.current(false);
    }, TYPING_DEBOUNCE_MS);
  }, []);

  const onStop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    typingRef.current = false;
    onTypingChangeRef.current(false);
  }, []);

  return useMemo(() => ({ onInput, onStop }), [onInput, onStop]);
}
