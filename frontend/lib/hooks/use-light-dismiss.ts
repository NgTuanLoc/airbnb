import { useEffect, type RefObject } from "react";

/**
 * Closes a disclosure (a button and what it opens; not an ARIA menu) on Escape, handing focus back to the button, or
 * on a press anywhere outside it.
 */
export function useLightDismiss(
  open: boolean,
  close: () => void,
  rootRef: RefObject<HTMLElement | null>,
  buttonRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close, rootRef, buttonRef]);
}
