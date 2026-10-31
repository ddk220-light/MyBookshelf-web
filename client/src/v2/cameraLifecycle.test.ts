import { afterEach, expect, it, vi } from 'vitest';
import { BrowserIsbnScanner } from './camera';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function camera() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const video = document.createElement('video');
  video.play = vi.fn(async () => {});
  Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_CURRENT_DATA });
  return { stop, stream, video };
}

it('releases a camera granted after the scanner was closed', async () => {
  const { stop, stream, video } = camera();
  let grant!: (stream: MediaStream) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const scanner = new BrowserIsbnScanner();
  const onCode = vi.fn();
  const opening = scanner.start(video, onCode);
  scanner.stop();
  grant(stream);
  await opening;
  expect(stop).toHaveBeenCalledOnce();
  expect(video.play).not.toHaveBeenCalled();
  expect(onCode).not.toHaveBeenCalled();
});

it('stops the acquired camera if video playback fails', async () => {
  const { stop, stream, video } = camera();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
  video.play = vi.fn(async () => { throw new Error('playback failed'); });
  await expect(new BrowserIsbnScanner().start(video, vi.fn())).rejects.toThrow('playback failed');
  expect(stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
});

it('discards a decode finishing after stop and never starts overlapping frame reads', async () => {
  vi.useFakeTimers();
  const { stop, stream, video } = camera();
  let finish!: (codes: Array<{ rawValue: string }>) => void;
  const detect = vi.fn(() => new Promise<Array<{ rawValue: string }>>((resolve) => { finish = resolve; }));
  vi.stubGlobal('BarcodeDetector', class { detect = detect; });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
  const scanner = new BrowserIsbnScanner();
  const onCode = vi.fn();
  await scanner.start(video, onCode);
  await vi.advanceTimersByTimeAsync(1500);
  expect(detect).toHaveBeenCalledOnce();
  scanner.stop();
  finish([{ rawValue: '9781625275868' }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(onCode).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
