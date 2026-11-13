import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertGlyph, BackGlyph, OfflineGlyph } from '../home/homeIcons';
import './panel-pages.css';

/** History entry index kept by the router; above 0 means an in-app page is behind this one. */
function canGoBack(): boolean {
  try {
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof index === 'number' && index > 0;
  } catch { return false; }
}

/**
 * "‹ Back" at the top of the panel's pages (Report a problem, Privacy, About,
 * Account settings, account forms). Back returns to whatever opened the page,
 * usually the side panel; opened directly, it goes to the shelf with the panel
 * open.
 */
export function BackLink({ fallback = '/app/shelf', fallbackState = { overlay: 'panel' } }: { fallback?: string; fallbackState?: unknown }) {
  const navigate = useNavigate();
  return <Link className="page-back" to={fallback} state={fallbackState} onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!canGoBack()) return;
    event.preventDefault();
    navigate(-1);
  }}><BackGlyph />Back</Link>;
}

/** One page in the one-shelf panel family: Back, a serif heading, content. */
export function PanelPage({ title, documentTitle, children, className = '' }: { title: ReactNode; documentTitle: string; children: ReactNode; className?: string }) {
  useEffect(() => { document.title = documentTitle + ' — MyBookshelf'; }, [documentTitle]);
  return <section className={'panel-page ' + className}>
    <BackLink />
    <h1 id="panel-page-title" tabIndex={-1}>{title}</h1>
    {children}
  </section>;
}

/**
 * The boards' error line: one short line with an icon, optionally followed by
 * one action (Try again, Log in). Announced once through role="alert".
 */
export function FormAlert({ id, offline = false, children, action }: { id?: string; offline?: boolean; children: ReactNode; action?: ReactNode }) {
  return <div className="form-alert" id={id} role="alert">
    <span className="form-alert-text">{offline ? <OfflineGlyph /> : <AlertGlyph />}{children}</span>
    {action}
  </div>;
}
