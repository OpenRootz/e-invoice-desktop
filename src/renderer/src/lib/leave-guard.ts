import { useEffect } from 'react';

let message: string | undefined;

/** While `dirty`, switching to another page asks first (see {@link confirmLeave}). */
export function useLeaveGuard(dirty: boolean, text: string) {
  useEffect(() => {
    message = dirty ? text : undefined;
    return () => {
      message = undefined;
    };
  }, [dirty, text]);
}

/** Asks before leaving a page with unsaved changes; true if leaving is fine. */
export function confirmLeave(): boolean {
  return !message || window.confirm(message);
}
