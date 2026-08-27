import { useEffect, useRef } from 'react';

export interface HotkeyHandlers {
  focusSearch: () => void;
  newNote: () => void;
  newChecklist: () => void;
  goNotes: () => void;
  goArchive: () => void;
  goTrash: () => void;
  openHelp: () => void;
}

/**
 * Global keyboard shortcuts. Attached once at the app root.
 *
 * All handling is skipped when a modifier is held or the event originates from a text field
 * (input/textarea/contenteditable) or a modal/settings surface -- so `/` still types a slash
 * inside a note and never hijacks browser/OS chords. `/` additionally calls preventDefault so the
 * character isn't inserted into the search box it just focused.
 */
export function useHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    // Tracks a pending "g" prefix for two-key navigation sequences (g n / g a / g t).
    let awaitingG = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      // Any open modal or the settings/admin page swallows shortcuts.
      return !!el.closest('.flip-modal, .settings-page, .admin-page');
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const h = ref.current;

      if (awaitingG) {
        awaitingG = false;
        clearTimeout(gTimer);
        if (e.key === 'n') return h.goNotes();
        if (e.key === 'a') return h.goArchive();
        if (e.key === 't') return h.goTrash();
        return;
      }

      switch (e.key) {
        case '/':
        case 's':
          e.preventDefault();
          h.focusSearch();
          return;
        case 'c':
          e.preventDefault();
          h.newNote();
          return;
        case 'l':
          e.preventDefault();
          h.newChecklist();
          return;
        case '?':
          e.preventDefault();
          h.openHelp();
          return;
        case 'g':
          awaitingG = true;
          gTimer = setTimeout(() => {
            awaitingG = false;
          }, 1000);
          return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(gTimer);
    };
  }, [enabled]);
}
