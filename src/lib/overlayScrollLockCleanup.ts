/**
 * Failsafe to recover from rare cases where Radix/react-remove-scroll leaves
 * the document scroll locked after an overlay (Dialog/Sheet/Drawer) unmounts.
 *
 * Symptom: after closing a modal, scrolling up/down "snaps back" or stays locked.
 *
 * We ONLY cleanup when there are no Lovable-marked overlays mounted.
 */

function hasAnyLovableOverlayMounted(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[data-lovable-overlay="true"]');
}

export function cleanupStuckScrollLock(): void {
  if (typeof document === "undefined") return;
  if (hasAnyLovableOverlayMounted()) return;

  const body = document.body;
  const html = document.documentElement;

  // react-remove-scroll marks scroll lock with this attribute.
  if (body?.hasAttribute("data-scroll-locked")) {
    body.removeAttribute("data-scroll-locked");
  }

  // Only revert styles when they look like scroll-lock artifacts.
  if (body?.style?.overflow === "hidden") body.style.overflow = "";
  if (html?.style?.overflow === "hidden") html.style.overflow = "";

  // Radix may add padding-right to compensate scrollbar.
  if (body?.style?.paddingRight) body.style.paddingRight = "";
  if (html?.style?.paddingRight) html.style.paddingRight = "";

  // Some scroll-lock strategies disable pointer events on body.
  if (body?.style?.pointerEvents === "none") body.style.pointerEvents = "";
}

/**
 * Schedule cleanup across a few frames/ticks to catch animation/unmount timing.
 */
export function scheduleScrollLockCleanup(): void {
  if (typeof window === "undefined") return;

  // After current paint
  requestAnimationFrame(() => cleanupStuckScrollLock());

  // After Radix close animation/microtasks
  window.setTimeout(() => cleanupStuckScrollLock(), 50);
  window.setTimeout(() => cleanupStuckScrollLock(), 250);
}
