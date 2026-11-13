import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IsbnScanner } from '../../camera';
import { cameraFailure, ScanDialog, typedIsbn, type ScanAnswer } from './ScanDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

function fakeScanner(failure?: unknown) {
  let onCode: ((code: string) => void) | undefined;
  const scanner: IsbnScanner & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } = {
    start: vi.fn(async (_video: HTMLVideoElement, callback: (code: string) => void) => {
      if (failure) throw failure;
      onCode = callback;
    }),
    stop: vi.fn(() => { onCode = undefined; }),
  };
  return { scanner, read: (code: string) => act(() => { onCode?.(code); }), running: () => Boolean(onCode) };
}

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function Harness({ scanner, onIsbn = async () => 'opened' as ScanAnswer, hasCamera = true, onSearchByTitle = () => {}, returnFocus }: {
  scanner: IsbnScanner; onIsbn?: (isbn: string, source: 'camera' | 'isbn') => Promise<ScanAnswer>; hasCamera?: boolean; onSearchByTitle?: () => void; returnFocus?: () => HTMLElement | null;
}) {
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open scan</button>
    <ScanDialog open={open} onClose={() => setOpen(false)} onIsbn={onIsbn} onSearchByTitle={() => { onSearchByTitle(); setOpen(false); }}
      createScanner={() => scanner} hasCamera={() => hasCamera} returnFocus={returnFocus} />
  </>;
}

describe('typed ISBNs', () => {
  it('accepts ISBN-13 and converts a valid ISBN-10; rejects anything else', () => {
    expect(typedIsbn('978-1-62527-586-8')).toBe('9781625275868');
    expect(typedIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(typedIsbn('080442957x')).toBe('9780804429573');
    expect(typedIsbn('0306406153')).toBeNull();
    expect(typedIsbn('9780000000000')).toBeNull();
    expect(typedIsbn('5012345678900')).toBeNull();
    expect(typedIsbn('')).toBeNull();
  });
  it('sorts camera failures into refused, busy and none', () => {
    expect(cameraFailure({ name: 'NotAllowedError' })).toBe('blocked');
    expect(cameraFailure({ name: 'NotReadableError' })).toBe('busy-camera');
    expect(cameraFailure({ name: 'NotFoundError' })).toBe('no-camera');
    expect(cameraFailure(new Error('UNSUPPORTED'))).toBe('no-camera');
  });
});

describe('scan pop-up', () => {
  it('scans: camera frame, one line, the ISBN field; an ISBN goes to its book with the camera off', async () => {
    const camera = fakeScanner();
    const onIsbn = vi.fn(() => new Promise<ScanAnswer>(() => {}));
    render(<Harness scanner={camera.scanner} onIsbn={onIsbn} />);
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Scan the barcode' });
    expect(dialog).toHaveTextContent('Barcode on the back cover');
    expect(screen.getByLabelText('Camera view')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'ISBN' })).toHaveAttribute('placeholder', 'ISBN, 10 or 13 digits');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(camera.scanner.start).toHaveBeenCalledOnce();
    camera.read('978-1625275868');
    expect(onIsbn).toHaveBeenCalledWith('9781625275868', 'camera');
    // The camera is off while the book is looked up.
    expect(camera.scanner.stop).toHaveBeenCalled();
    expect(camera.running()).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Finding…');
  });

  it('a barcode that is not an ISBN: one line, camera stays on; the second miss ends in "Couldn’t match that barcode"', async () => {
    const camera = fakeScanner();
    const onSearchByTitle = vi.fn();
    render(<Harness scanner={camera.scanner} onSearchByTitle={onSearchByTitle} />);
    await settle();
    camera.read('5012345678900');
    expect(screen.getByRole('status')).toHaveTextContent('Not an ISBN. Try the back cover.');
    expect(screen.queryByText('Barcode on the back cover')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'ISBN' })).toHaveAttribute('placeholder', 'Or type the ISBN');
    expect(camera.running()).toBe(true);
    // Still holding the same barcode is not a second try.
    camera.read('5012345678900');
    camera.read('5012345678900');
    expect(screen.getByRole('dialog', { name: 'Scan the barcode' })).toBeInTheDocument();
    camera.read('012345678905');
    expect(screen.getByRole('dialog', { name: 'Couldn’t match that barcode' })).toBeInTheDocument();
    expect(camera.running()).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'ISBN' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search by title' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Scan the barcode' })).toHaveTextContent('Barcode on the back cover');
    expect(camera.scanner.start).toHaveBeenCalledTimes(2);
    // The count starts again after Scan again.
    camera.read('5012345678900');
    expect(screen.getByRole('status')).toHaveTextContent('Not an ISBN');
    camera.read('4006381333931');
    fireEvent.click(screen.getByRole('button', { name: 'Search by title' }));
    expect(onSearchByTitle).toHaveBeenCalledOnce();
    expect(camera.running()).toBe(false);
  });

  it('an ISBN with no known book ends in "Couldn’t match that barcode"; a failed lookup does not', async () => {
    const camera = fakeScanner();
    const answers: ScanAnswer[] = ['failed', 'unknown'];
    const onIsbn = vi.fn(async () => answers.shift()!);
    render(<Harness scanner={camera.scanner} onIsbn={onIsbn} />);
    await settle();
    camera.read('9781625275868');
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t search. Try again.');
    expect(screen.getByRole('dialog', { name: 'Scan the barcode' })).toBeInTheDocument();
    // The camera comes back; the same code is not retried on every frame.
    expect(camera.running()).toBe(true);
    camera.read('9781625275868');
    expect(onIsbn).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('textbox', { name: 'ISBN' }), { target: { value: '9780306406157' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    await settle();
    expect(onIsbn).toHaveBeenLastCalledWith('9780306406157', 'isbn');
    expect(screen.getByRole('dialog', { name: 'Couldn’t match that barcode' })).toBeInTheDocument();
  });

  it('camera refused: "Allow camera" asks again and the ISBN field stays', async () => {
    const camera = fakeScanner(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const onIsbn = vi.fn(async () => 'opened' as ScanAnswer);
    render(<Harness scanner={camera.scanner} onIsbn={onIsbn} />);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Scan the barcode' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Camera view')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow camera' }));
    await settle();
    expect(camera.scanner.start).toHaveBeenCalledTimes(2);
    const field = screen.getByRole('textbox', { name: 'ISBN' });
    expect(field).toHaveAttribute('placeholder', 'Or type the ISBN');
    fireEvent.change(field, { target: { value: '12345' } });
    fireEvent.submit(field);
    expect(screen.getByRole('status')).toHaveTextContent('Check the ISBN.');
    expect(onIsbn).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '0306406152' } });
    fireEvent.submit(field);
    expect(onIsbn).toHaveBeenCalledWith('9780306406157', 'isbn');
  });

  it('a camera held by another app offers Try again', async () => {
    const camera = fakeScanner(Object.assign(new Error('busy'), { name: 'NotReadableError' }));
    render(<Harness scanner={camera.scanner} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('no camera: straight to "Type the ISBN" with the field focused and no camera request', async () => {
    const camera = fakeScanner();
    const onIsbn = vi.fn(async () => 'unknown' as ScanAnswer);
    render(<Harness scanner={camera.scanner} hasCamera={false} onIsbn={onIsbn} />);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Type the ISBN' })).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'ISBN' });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('placeholder', '978…');
    expect(camera.scanner.start).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '9781625275868' } });
    fireEvent.submit(field);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Couldn’t match that barcode' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Type the ISBN' })).toBeInTheDocument();
    expect(camera.scanner.start).not.toHaveBeenCalled();
  });

  it('a camera that is not there (start fails) also goes to typing', async () => {
    const camera = fakeScanner(Object.assign(new Error('none'), { name: 'NotFoundError' }));
    render(<Harness scanner={camera.scanner} />);
    await settle();
    expect(screen.getByRole('dialog', { name: 'Type the ISBN' })).toBeInTheDocument();
  });

  it('releases the camera when the page is hidden and when the pop-up closes; Escape closes and focus returns', async () => {
    const camera = fakeScanner();
    const opener = document.createElement('button');
    document.body.append(opener);
    render(<Harness scanner={camera.scanner} returnFocus={() => opener} />);
    await settle();
    expect(camera.running()).toBe(true);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(camera.running()).toBe(false);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle();
    expect(camera.running()).toBe(true);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(camera.running()).toBe(false);
    expect(opener).toHaveFocus();
    opener.remove();

    // Reopening starts fresh.
    fireEvent.click(screen.getByRole('button', { name: 'Open scan' }));
    await settle();
    expect(screen.getByRole('dialog', { name: 'Scan the barcode' })).toHaveTextContent('Barcode on the back cover');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(camera.running()).toBe(false);
  });
});
