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

function pendingCamera() {
  let grant!: (stream: MediaStream) => void, refuse!: (error: unknown) => void;
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve, reject) => { grant = resolve; refuse = reject; }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return { getUserMedia, grant: (stream: MediaStream) => grant(stream), refuse: (error: unknown) => refuse(error) };
}

it('a restart while the permission prompt is up joins the same request, and a refusal reaches the running scanner', async () => {
  const prompt = pendingCamera();
  const first = new BrowserIsbnScanner(), second = new BrowserIsbnScanner();
  const firstOpening = first.start(camera().video, vi.fn());
  // The page was hidden and shown again (or a lookup ran) while the prompt was up.
  first.stop();
  const secondOpening = second.start(camera().video, vi.fn());
  const again = second.start(camera().video, vi.fn());
  expect(prompt.getUserMedia).toHaveBeenCalledOnce();
  const refused = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  prompt.refuse(refused);
  await expect(again).rejects.toBe(refused);
  // Stopped starts end quietly; only the running one reports the refusal.
  await expect(firstOpening).resolves.toBeUndefined();
  await expect(secondOpening).resolves.toBeUndefined();
  // The next start asks again with a new request.
  const retry = new BrowserIsbnScanner().start(camera().video, vi.fn());
  expect(prompt.getUserMedia).toHaveBeenCalledTimes(2);
  prompt.refuse(refused);
  await expect(retry).rejects.toBe(refused);
});

it('a camera granted after a restart goes to the running scanner and is released once it stops', async () => {
  const prompt = pendingCamera();
  const { stop, stream, video } = camera();
  const first = new BrowserIsbnScanner(), second = new BrowserIsbnScanner();
  const firstVideo = camera().video;
  const firstOpening = first.start(firstVideo, vi.fn());
  first.stop();
  const secondOpening = second.start(video, vi.fn());
  prompt.grant(stream);
  await Promise.all([firstOpening, secondOpening]);
  expect(prompt.getUserMedia).toHaveBeenCalledOnce();
  expect(video.srcObject).toBe(stream);
  expect(firstVideo.srcObject).toBeFalsy();
  expect(stop).not.toHaveBeenCalled();
  second.stop();
  expect(stop).toHaveBeenCalledOnce();
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

it('reads only EAN-13 by default and, for the scan pop-up, other retail codes it can report as not an ISBN', async () => {
  vi.useFakeTimers();
  const requested: string[][] = [];
  vi.stubGlobal('BarcodeDetector', class {
    static async getSupportedFormats() { return ['ean_13', 'ean_8', 'upc_a', 'qr_code']; }
    constructor(options: { formats: string[] }) { requested.push(options.formats); }
    async detect() { return [{ rawValue: '5012345678900' }]; }
  });
  for (const formats of [undefined, 'product'] as const) {
    const { stream, video } = camera();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } });
    const scanner = new BrowserIsbnScanner(formats);
    const onCode = vi.fn();
    await scanner.start(video, onCode);
    await vi.advanceTimersByTimeAsync(10);
    expect(onCode).toHaveBeenCalledWith('5012345678900');
    scanner.stop();
  }
  // upc_e is not supported here, so it is not asked for.
  expect(requested).toEqual([['ean_13'], ['ean_13', 'ean_8', 'upc_a']]);
});
