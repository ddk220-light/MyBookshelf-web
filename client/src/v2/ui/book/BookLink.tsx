import { flushSync } from 'react-dom';
import { Link, useNavigate, type LinkProps } from 'react-router-dom';

// Only the activated spine participates: the same book can occur on two shelves.
// Modified clicks keep normal link semantics, including opening in another tab.
export function BookLink({ state, onClick, ...props }: LinkProps) {
  const navigate = useNavigate();
  return <Link {...props} state={state} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (props.target && props.target !== '_self') || !document.startViewTransition
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    const source = event.currentTarget;
    source.style.viewTransitionName = 'reading-book';
    const transition = document.startViewTransition(() => {
      flushSync(() => navigate(props.to, { state: { ...state, transition: true } }));
    });
    void transition.finished.catch(() => {}).finally(() => { source.style.viewTransitionName = ''; });
  }} />;
}
