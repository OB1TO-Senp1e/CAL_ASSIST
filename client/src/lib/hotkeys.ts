import { useEffect, useRef } from 'react';

/**
 * Minimal keyboard-shortcut hook. Keyboard-first is a core design value
 * (DESIGN_SYSTEM.md §Interaction), so every primary action gets a key.
 *
 * Combo syntax: "mod+k" (⌘ on mac, Ctrl elsewhere), "shift+/", "t", "[".
 * Plain-key shortcuts are ignored while typing in inputs/textareas/contenteditable.
 */
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKeyLabel = isMac ? '⌘' : 'Ctrl';

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function matches(combo: string, e: KeyboardEvent) {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop()!;
  const wantMod = parts.includes('mod');
  const wantShift = parts.includes('shift');
  const wantAlt = parts.includes('alt');
  const hasMod = isMac ? e.metaKey : e.ctrlKey;
  return (
    e.key.toLowerCase() === key && hasMod === wantMod && e.shiftKey === wantShift && e.altKey === wantAlt
  );
}

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      for (const [combo, handler] of Object.entries(ref.current)) {
        if (!matches(combo, e)) continue;
        const usesMod = combo.toLowerCase().includes('mod+');
        if (!usesMod && isTypingTarget(e.target)) continue;
        e.preventDefault();
        handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
