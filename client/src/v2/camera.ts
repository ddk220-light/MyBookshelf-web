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

async function fallbackDecoder(): Promise<FrameDecoder> {
  // Load the on-device decoder only when a camera is opened and needs it.
  const { createBarcodeDecoder } = await import('./barcodeDecoder');
  return createBarcodeDecoder();
}

async function createDecoder(): Promise<FrameDecoder> {
  const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (Detector) {
    try {
      const formats = await Detector.getSupportedFormats?.();
      if (!formats || formats.includes('ean_13')) {
        const detector = new Detector({ formats: ['ean_13'] });
        let fallback: FrameDecoder | null = null;
        return async (video) => {
          if (!fallback) {
            try {
              return (await detector.detect(video)).find((item) => item.rawValue)?.rawValue || null;
            } catch {
              // Some browsers expose the API but cannot run this detector.
              fallback = await fallbackDecoder();
            }
          }
          return fallback(video);
        };
      }
    } catch { /* Unsupported native formats use the same local decoder. */ }
  }
  return fallbackDecoder();
}

export class BrowserIsbnScanner implements IsbnScanner {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private session = 0;

  async start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<void> {
    this.stop();
    const session = this.session;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      // Permission can resolve after Close, a route change, or hiding the tab.
      if (session !== this.session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video = video;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (session !== this.session) return;
      const decode = await createDecoder();
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
