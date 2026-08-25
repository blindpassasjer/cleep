import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FLIP_OPEN_MS = 220;
const FLIP_CLOSE_MS = 180;

export type CloseFn = (mode?: 'flip' | 'fade') => void;

interface Props {
  originRect: DOMRect;
  /**
   * Re-measures the origin rect right before the close animation starts. The source element (e.g.
   * a note card) can stay mounted and change size while the modal is open -- an attachment added
   * mid-edit grows the card and reflows the grid around it, so the rect captured at open time no
   * longer matches where the card actually is by the time the modal closes. Falls back to the
   * static `originRect` when omitted or when it returns null (e.g. the source has unmounted).
   */
  getOriginRect?: () => DOMRect | null;
  panelClassName?: string;
  /** Called once the close animation has fully finished — do state teardown here. */
  onClose: () => void;
  /** Called the instant a close is requested (before the animation plays), e.g. to reveal whatever sits underneath. */
  onCloseStart?: () => void;
  /**
   * Intercepts Escape/backdrop-click. Given the real `close` function to call once ready; defaults
   * to calling it immediately. Use this when closing needs to do something first (e.g. save data)
   * and only actually animate away on success, keeping the modal open to show an error otherwise.
   */
  onRequestClose?: (close: CloseFn) => void;
  children: (close: CloseFn) => ReactNode;
}

function flipTransform(from: DOMRect, to: DOMRect) {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
}

export function FlipModal({ originRect, getOriginRect, panelClassName, onClose, onCloseStart, onRequestClose, children }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState<'flip' | 'fade' | null>(null);
  // Tracks whether the mousedown that led to this click actually started on the backdrop itself,
  // not inside the modal -- otherwise selecting text and releasing the mouse outside the modal
  // (a normal drag-to-select gesture) reports its click target as the backdrop and closes the note.
  const mouseDownOnBackdrop = useRef(false);

  // On mobile the modal is a full-screen sheet sized off 100vh/100% (see .note-modal's mobile
  // rule), which is the *layout* viewport -- most mobile browsers don't shrink that when the
  // on-screen keyboard opens, so anything near the bottom (the format toolbar, the footer) ends up
  // hidden behind it. window.visualViewport.height does shrink, reliably, across iOS/Android --
  // mirror it into a custom property so the mobile CSS can size the sheet against the space
  // actually visible above the keyboard instead of the full screen.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = modalRef.current;
    if (!vv || !el) return;
    function update() {
      el!.style.setProperty('--modal-vvh', `${vv!.height}px`);
    }
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  useLayoutEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const finalRect = el.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.transform = flipTransform(originRect, finalRect);
    el.style.opacity = '0.5';
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.transition = `transform ${FLIP_OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease`;
      el.style.transform = 'none';
      el.style.opacity = '1';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FLIP animation runs once against the captured origin rect
  }, []);

  const close: CloseFn = (mode = 'flip') => {
    setClosing(mode);
    // Reveal whatever sits underneath immediately (not after the animation finishes) so it's
    // already in place — visible or mid-leave-animation — by the time the modal finishes flying
    // back onto it. Waiting until onClose() (post-animation) left a gap where neither was visible.
    onCloseStart?.();
    const el = modalRef.current;
    if (el && mode === 'flip') {
      const currentRect = el.getBoundingClientRect();
      const dest = getOriginRect?.() ?? originRect;
      el.style.transition = `transform ${FLIP_CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${FLIP_CLOSE_MS}ms ease`;
      el.style.transform = flipTransform(dest, currentRect);
      el.style.opacity = '0';
    }
    setTimeout(onClose, FLIP_CLOSE_MS);
  };

  function requestClose() {
    if (onRequestClose) onRequestClose(close);
    else close();
  }

  // Refs sidestep stale closures in the mount-once effect below (empty deps, so it survives
  // re-renders without re-attaching) -- otherwise Escape/backdrop would act on whatever
  // close/onRequestClose existed on the very first render, ignoring later prop changes.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') requestCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Without this, a phone's back gesture/button navigates the browser away from Cleep entirely
  // (or to whatever page was open before) instead of just closing the note -- there's nothing in a
  // single-page app to tell the browser "this modal is a screen of its own" otherwise. Pushing a
  // history entry on open gives it exactly that: back now lands on a popstate here first, which
  // closes the modal instead. If the modal closes some other way (Done, Escape, backdrop), the
  // cleanup below consumes that same entry with history.back() so it doesn't linger as a dead
  // state the user would otherwise have to back through later -- guarded so it doesn't fire when
  // the close was itself the result of a back navigation (that back already consumed the entry).
  useEffect(() => {
    let closedByPopState = false;
    history.pushState({ cleepModal: true }, '');
    function onPopState() {
      closedByPopState = true;
      requestCloseRef.current();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!closedByPopState) history.back();
    };
  }, []);

  return createPortal(
    <div
      className={`note-modal-backdrop ${closing ? 'closing' : ''}`}
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) requestCloseRef.current();
      }}
    >
      <div
        className={`note-modal ${panelClassName ?? ''} ${closing === 'fade' ? 'note-modal-fading' : ''}`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
