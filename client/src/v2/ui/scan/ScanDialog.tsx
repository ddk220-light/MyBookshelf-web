import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { BrowserIsbnScanner, type IsbnScanner } from '../../camera';
import { isValidIsbn13 } from '../../context';
import { trapTab } from '../home/dialogFocus';
import { CameraOffGlyph, CloseGlyph, SearchGlyph, WarningGlyph } from '../home/homeIcons';
import './scan.css';

/** What the home screen did with an ISBN: opened its book, knows no book for it, or could not look (never "no book"). */
export type ScanAnswer = 'opened' | 'unknown' | 'failed';
export type ScanSource = 'camera' | 'isbn';

type Mode = 'camera' | 'blocked' | 'busy-camera' | 'no-camera' | 'no-match';
type Notice = 'not-isbn' | 'check' | 'failed' | null;

/** A miss is a decoded barcode that is not an ISBN. The second one ends scanning. */
export const MISSES_BEFORE_NO_MATCH = 2;
/** The same code read again within this time is the reader still holding it, not a new try. */
export const SAME_CODE_MS = 2500;

/** A typed ISBN-13, or an ISBN-10 converted to ISBN-13; null if it is not a valid ISBN. */
export function typedIsbn(value: string): string | null {
  const text = value.replace(/[\s-]/g, '').toUpperCase();
  if (isValidIsbn13(text)) return text;
  if (!/^\d{9}[\dX]$/.test(text)) return null;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) sum += (text[index] === 'X' ? 10 : Number(text[index])) * (10 - index);
  if (sum % 11 !== 0) return null;
  const stem = '978' + text.slice(0, 9);
  let check = 0;
  for (let index = 0; index < 12; index += 1) check += Number(stem[index]) * (index % 2 === 0 ? 1 : 3);
  return stem + ((10 - (check % 10)) % 10);
}

/** Why the camera did not start: refused (Allow camera asks again), held by another app, or none here. */
export function cameraFailure(failure: unknown): 'blocked' | 'busy-camera' | 'no-camera' {
  const name = failure && typeof failure === 'object' && 'name' in failure ? String(failure.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'blocked';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy-camera';
  return 'no-camera';
}

const browserHasCamera = () => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

/**
 * The scan pop-up (Scan and ScanStates boards): a bottom sheet over the home
 * screen with the camera and an ISBN field. A scanned or typed ISBN goes to
 * `onIsbn`; the home screen opens the book (and closes this pop-up) or says
 * it knows no book for it. A barcode that is not an ISBN gets one line and
 * the camera keeps running; the second one, or an ISBN with no known book,
 * ends in "Couldn't match that barcode". The camera runs only while the
 * pop-up is open, the page is visible and nothing is being looked up.
 * Nothing scanned or typed is stored.
 */
export function ScanDialog({ open, onClose, onIsbn, onSearchByTitle, returnFocus, createScanner = () => new BrowserIsbnScanner('product'), hasCamera = browserHasCamera }: {
  open: boolean;
  onClose: () => void;
  onIsbn: (isbn: string, source: ScanSource) => Promise<ScanAnswer>;
  onSearchByTitle: () => void;
  returnFocus?: () => HTMLElement | null;
  createScanner?: () => IsbnScanner;
  hasCamera?: () => boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<Mode>('camera');
  const [notice, setNotice] = useState<Notice>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [attempt, setAttempt] = useState(0);
  const misses = useRef(0);
  const lastSeen = useRef(new Map<string, number>());
  const alive = useRef(true);
  const createScannerRef = useRef(createScanner);
  createScannerRef.current = createScanner;
  const onIsbnRef = useRef(onIsbn);
  onIsbnRef.current = onIsbn;
  const noCamera = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Every opening starts fresh: camera (or straight to typing), no misses.
  // Set while rendering, so the camera is never asked for on a device without one.
  const [shownOpen, setShownOpen] = useState(false);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      noCamera.current = !hasCamera();
      setMode(noCamera.current ? 'no-camera' : 'camera');
      setNotice(null); setTyped(''); setBusy(false);
      misses.current = 0;
      lastSeen.current.clear();
    }
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      returnFocus?.()?.focus();
    }
  }, [open, returnFocus]);

  // Focus follows the state: the close button while the camera is offered,
  // the field when typing is the only way, the next step after a no-match.
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const target = mode === 'no-camera' ? dialog?.querySelector<HTMLElement>('#scan-isbn')
      : mode === 'no-match' ? dialog?.querySelector<HTMLElement>('.scan-search-title')
        : dialog?.contains(document.activeElement) ? null : dialog?.querySelector<HTMLElement>('.scan-close');
    target?.focus();
  }, [open, mode]);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const find = useCallback(async (isbn: string, source: ScanSource) => {
    setBusy(true); setNotice(null);
    let answer: ScanAnswer;
    try { answer = await onIsbnRef.current(isbn, source); } catch { answer = 'failed'; }
    if (!alive.current) return;
    if (answer === 'opened') return;
    setBusy(false);
    if (answer === 'unknown') setMode('no-match');
    else {
      setNotice('failed');
      // Holding the same barcode tries again after a pause, not on every frame.
      lastSeen.current.set(isbn, Date.now());
    }
  }, []);

  const onCode = useCallback((code: string) => {
    const value = code.replace(/[\s-]/g, '');
    const now = Date.now();
    const seen = lastSeen.current.get(value);
    if (seen !== undefined && now - seen < SAME_CODE_MS) {
      if (!isValidIsbn13(value)) lastSeen.current.set(value, now);
      return;
    }
    lastSeen.current.set(value, now);
    if (isValidIsbn13(value)) { void find(value, 'camera'); return; }
    misses.current += 1;
    if (misses.current >= MISSES_BEFORE_NO_MATCH) setMode('no-match');
    else setNotice('not-isbn');
  }, [find]);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  // The camera: on only while open, visible, scanning and not looking a code up.
  const scanning = open && shownOpen && mode === 'camera' && !hidden && !busy;
  useEffect(() => {
    if (!scanning || !video.current) return;
    const scanner = createScannerRef.current();
    let active = true;
    scanner.start(video.current, code => { if (active) onCodeRef.current(code); }).catch((failure: unknown) => {
      if (!active) return;
      scanner.stop();
      const next = cameraFailure(failure);
      if (next === 'no-camera') noCamera.current = true;
      setMode(next);
    });
    return () => { active = false; scanner.stop(); };
  }, [scanning, attempt]);

  const retryCamera = () => { setNotice(null); setMode('camera'); setAttempt(value => value + 1); };
  const scanAgain = () => {
    misses.current = 0; lastSeen.current.clear();
    if (noCamera.current) { setNotice(null); setMode('no-camera'); } else retryCamera();
  };
  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const isbn = typedIsbn(typed);
    if (!isbn) { setNotice('check'); return; }
    void find(isbn, 'isbn');
  };
  const keyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); return; }
    trapTab(event, ref.current);
  };
  // The sheet is the dialog's own box; a click outside it is on the backdrop.
  const backdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== ref.current) return;
    const box = ref.current.getBoundingClientRect();
    if (event.clientX > box.right || event.clientX < box.left || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };

  const title = mode === 'no-camera' ? 'Type the ISBN' : mode === 'no-match' ? 'Couldn’t match that barcode' : 'Scan the barcode';
  const plain = mode === 'camera' && !notice && !busy;
  const line = busy ? 'Finding…' : notice === 'not-isbn' ? 'Not an ISBN. Try the back cover.' : notice === 'check' ? 'Check the ISBN.' : notice === 'failed' ? 'Couldn’t search. Try again.' : null;

  return <dialog ref={ref} className="scan-dialog" aria-labelledby={titleId} onKeyDown={keyDown} onClick={backdrop}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}>
    {open && <>
      <span className="scan-handle" aria-hidden="true" />
      <div className="scan-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="scan-close" aria-label="Close" onClick={onClose}><CloseGlyph /></button>
      </div>

      {mode === 'no-match' ? <div className="scan-actions">
        <button type="button" className="home-button scan-search-title" onClick={onSearchByTitle}><SearchGlyph />Search by title</button>
        <button type="button" className="home-button home-button-outline" onClick={scanAgain}>{noCamera.current ? 'Try again' : 'Scan again'}</button>
      </div> : <>
        {mode === 'camera' && <div className="scan-camera">
          <video ref={video} muted playsInline aria-label="Camera view" />
          <span className="scan-frame" aria-hidden="true"><span className="scan-line" /></span>
        </div>}
        {(mode === 'blocked' || mode === 'busy-camera') && <div className="scan-camera scan-camera-small scan-camera-off">
          <CameraOffGlyph />
          <button type="button" className="scan-allow" onClick={retryCamera}>{mode === 'blocked' ? 'Allow camera' : 'Try again'}</button>
        </div>}
        {plain && <p className="scan-hint">Barcode on the back cover</p>}
        <div className="scan-status" role="status">{line && <p className={'scan-notice' + (busy ? ' scan-notice-quiet' : '')}>{!busy && <WarningGlyph />}{line}</p>}</div>
        {plain && <p className="scan-or" aria-hidden="true"><span>or type the number under the barcode</span></p>}
        <form className="scan-isbn" onSubmit={submitTyped}>
          <input id="scan-isbn" aria-label="ISBN" inputMode="numeric" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={20}
            placeholder={mode === 'no-camera' ? '978…' : plain ? 'ISBN, 10 or 13 digits' : 'Or type the ISBN'}
            value={typed} onChange={event => { setTyped(event.target.value); if (notice === 'check') setNotice(null); }} />
          <button type="submit" className="scan-find" disabled={busy}>Find</button>
        </form>
      </>}
    </>}
  </dialog>;
}
