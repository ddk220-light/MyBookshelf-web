import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraLookup } from './ui/scan/ScanPage';
import type { IsbnScanner } from './camera';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

function setupScanner() {
  let onCode: ((code: string) => void) | undefined;
  const scanner: IsbnScanner = {
    start: vi.fn(async (_video, callback) => { onCode = callback; }),
    stop: vi.fn(),
  };
  return { scanner, scanned: (value: string) => onCode?.(value) };
}

async function openCamera() {
  fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode' }));
  await act(async () => { vi.runAllTimers(); await Promise.resolve(); });
}

describe('camera ISBN fallback', () => {
  it('accepts a valid ISBN once and tears down the camera', async () => {
    vi.useFakeTimers();
    const { scanner, scanned } = setupScanner();
    const onScanned = vi.fn();
    render(<CameraLookup onScanned={onScanned} createScanner={() => scanner} />);

    await openCamera();
    act(() => scanned('9781625275868'));

    expect(onScanned).toHaveBeenCalledWith('9781625275868');
    expect(scanner.stop).toHaveBeenCalled();
    act(() => scanned('9781625275868'));
    expect(onScanned).toHaveBeenCalledTimes(1);
  });

  it('keeps manual fallback available for an invalid barcode and a denied camera', async () => {
    vi.useFakeTimers();
    const invalid = setupScanner();
    const view = render(<CameraLookup onScanned={vi.fn()} createScanner={() => invalid.scanner} />);
    await openCamera();
    act(() => invalid.scanned('9780000000000'));
    expect(screen.getByRole('alert')).toHaveTextContent('Barcode not recognized');
    view.unmount();

    const denied: IsbnScanner = { start: vi.fn(async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); }), stop: vi.fn() };
    render(<CameraLookup onScanned={vi.fn()} createScanner={() => denied} />);
    await openCamera();
    expect(screen.getByRole('alert')).toHaveTextContent('Camera access was not allowed');
  });

  it('stops the stream when the tab becomes hidden or the component unmounts', async () => {
    vi.useFakeTimers();
    const { scanner } = setupScanner();
    const view = render(<CameraLookup onScanned={vi.fn()} createScanner={() => scanner} />);
    await openCamera();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(scanner.stop).toHaveBeenCalled();
    view.unmount();
    expect(scanner.stop).toHaveBeenCalledTimes(2);
  });
});
