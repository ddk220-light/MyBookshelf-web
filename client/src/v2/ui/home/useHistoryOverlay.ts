import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type OverlayState = Record<string, unknown> & { overlay?: string };

/**
 * An overlay (pop-up) opened as its own history entry, as on the home screen:
 * `state.overlay = name` plus `<name>Pushed` when this hook pushed the entry.
 * Back closes it; `close` goes back when it pushed the entry, and otherwise
 * replaces the entry without the overlay. Any other history state (a book's
 * navigation state, a search) is kept.
 */
export function useHistoryOverlay(name: 'library') {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as OverlayState | null;
  const latest = useRef(state);
  latest.current = state;
  const pushedKey = name + 'Pushed';
  const path = location.pathname + location.search;
  const open = state?.overlay === name;
  const show = useCallback(() => {
    if (latest.current?.overlay === name) return;
    navigate(path, { state: { ...(latest.current || {}), overlay: name, [pushedKey]: true } });
  }, [navigate, path, name, pushedKey]);
  const close = useCallback(() => {
    const current = latest.current;
    if (current?.overlay !== name) return;
    if (current[pushedKey]) { navigate(-1); return; }
    const { overlay: _overlay, [pushedKey]: _pushed, ...rest } = current;
    navigate(path, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, path, name, pushedKey]);
  return { open, show, close };
}
