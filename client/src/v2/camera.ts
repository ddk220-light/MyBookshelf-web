type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

export type IsbnScanner = {
  start: (video: HTMLVideoElement, onCode: (code: string) => void) => Promise<void>;
  stop: () => void;
};

/**
 * Which barcodes a scanner reports. `isbn` reads EAN-13 only (ISBNs are
 * EAN-13). `product` also reads the other retail codes (EAN-8, UPC-A,
 * UPC-E), so a reader pointing at a price or shop label is told it is not an
 * ISBN instead of seeing nothing happen. Every decoded value is passed on;
 * the caller decides whether it is an ISBN.
 */
export type ScanFormats = 'isbn' | 'product';
const NATIVE_FORMATS: Record<ScanFormats, string[]> = { isbn: ['ean_13'], product: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] };

async function fallbackDecoder(formats: ScanFormats): Promise<FrameDecoder> {
  // Load the on-device decoder only when a camera is opened and needs it.
  const { createBarcodeDecoder } = await import('./barcodeDecoder');
  return createBarcodeDecoder(formats === 'product');
}

async function createDecoder(wanted: ScanFormats): Promise<FrameDecoder> {
  const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (Detector) {
    try {
      const formats = await Detector.getSupportedFormats?.();
      if (!formats || formats.includes('ean_13')) {
        const detector = new Detector({ formats: NATIVE_FORMATS[wanted].filter(format => !formats || formats.includes(format)) });
        let fallback: FrameDecoder | null = null;
        return async (video) => {
          if (!fallback) {
            try {
              return (await detector.detect(video)).find((item) => item.rawValue)?.rawValue || null;
            } catch {
              // Some browsers expose the API but cannot run this detector.
              fallback = await fallbackDecoder(wanted);
            }
          }
          return fallback(video);
        };
      }
    } catch { /* Unsupported native formats use the same local decoder. */ }
  }
  return fallbackDecoder(wanted);
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

type CameraClaim = { active: () => boolean; resolve: (stream: MediaStream | null) => void; reject: (error: unknown) => void };
let pendingCamera: CameraClaim[] | null = null;

/**
 * One camera request at a time, shared across restarts. While the browser's
 * permission prompt is up, the scanner may be stopped and started again (the
 * page hidden and shown, a lookup started and finished, the pop-up closed and
 * reopened). A second getUserMedia call then would be a second prompt, and
 * the first prompt's answer would reach a scanner that had already gone, so a
 * refusal (Cancel) could be lost. Instead every start joins the request in
 * flight. When it settles: a refusal reaches every waiting start (stopped
 * ones ignore it); a camera goes to the newest start still running and
 * the others get null; with none running, the camera is released at once.
 */
export function requestCamera(active: () => boolean): Promise<MediaStream | null> {
  return new Promise<MediaStream | null>((resolve, reject) => {
    if (pendingCamera) { pendingCamera.push({ active, resolve, reject }); return; }
    const claims: CameraClaim[] = [{ active, resolve, reject }];
    pendingCamera = claims;
    let request: Promise<MediaStream>;
    try { request = navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS); }
    catch (error) { request = Promise.reject(error); }
    request.then(stream => {
      if (pendingCamera === claims) pendingCamera = null;
      const owner = [...claims].reverse().find(claim => claim.active());
      if (!owner) stream.getTracks().forEach(track => track.stop());
      for (const claim of claims) claim.resolve(claim === owner ? stream : null);
    }, (error: unknown) => {
      if (pendingCamera === claims) pendingCamera = null;
      for (const claim of claims) claim.reject(error);
    });
  });
}

export class BrowserIsbnScanner implements IsbnScanner {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private session = 0;

  constructor(private readonly formats: ScanFormats = 'isbn') {}

  async start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<void> {
    this.stop();
    const session = this.session;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
    try {
      // Permission can resolve after Close, a route change, or hiding the tab:
      // a stopped scanner gets null (the camera went to a newer start, or was
      // released), never a second prompt.
      const stream = await requestCamera(() => session === this.session);
      if (!stream || session !== this.session) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video = video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (session !== this.session) return;
      const decode = await createDecoder(this.formats);
      if (session !== this.session) return;
      const tick = async () => {
        if (session !== this.session) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const code = await decode(video);
            if (session === this.session && code) onCode(code);
          } catch { /* A blurry or incomplete frame is retried. */ }
        }
        // Slow decodes must not overlap reads or outlive the camera session.
        if (session === this.session) this.timer = window.setTimeout(() => { void tick(); }, 250);
      };
      void tick();
    } catch (error) {
      if (session !== this.session) return;
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.session += 1;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.video) this.video.srcObject = null;
    this.stream = null;
    this.video = null;
  }
}
