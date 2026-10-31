import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export function createBarcodeDecoder() {
  const reader = new BrowserMultiFormatReader(new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    [DecodeHintType.TRY_HARDER, true],
  ]));
  return async (video: HTMLVideoElement): Promise<string | null> => {
    try {
      return reader.decode(video).getText();
    } catch {
      // No complete barcode in this frame; the scanner will try the next one.
      return null;
    }
  };
}
