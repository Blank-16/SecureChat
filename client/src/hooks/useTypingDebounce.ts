import { useRef, useCallback, useEffect, useMemo } from "react";
import { TYPING_DEBOUNCE_MS } from "../lib/constants";

const TYPING_RESEND_MS = 1500;

export function useTypingDebounce(onTypingChange: (isTyping: boolean) => void) {
  const typingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTypingChangeRef = useRef(onTypingChange);

  // Keep callback reference updated without triggering re-creation of useCallback
  useEffect(() => {
    onTypingChangeRef.current = onTypingChange;
  }, [onTypingChange]);

  const onInput = useCallback(() => {
    if (!typingRef.current) {
      typingRef.current = true;
      onTypingChangeRef.current(true);
      
      // Periodically re-send true so the receiver's auto-expire doesn't clear it
      resendTimerRef.current = setInterval(() => {
        if (typingRef.current) {
          onTypingChangeRef.current(true);
        }
      }, TYPING_RESEND_MS);
    }
    
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      typingRef.current = false;
      onTypingChangeRef.current(false);
      if (resendTimerRef.current) {
        clearInterval(resendTimerRef.current);
        resendTimerRef.current = null;
      }
    }, TYPING_DEBOUNCE_MS);
  }, []);

  const onStop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    timerRef.current = null;
    resendTimerRef.current = null;
    typingRef.current = false;
    onTypingChangeRef.current(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  return useMemo(() => ({ onInput, onStop }), [onInput, onStop]);
}
