// EAN-13 image pixels, fed through a real canvas MediaStream and video element.
// Only camera hardware is replaced: the shipped decoder must read these bars.
// Options: `code` is the EAN-13 drawn (an ISBN by default); a page can change
// it later with `window.__testBarcode = '…'`. `camera`: 'on' (default),
// 'denied' (permission refused until `window.__testCameraAllow = true`) or
// 'none' (no camera API at all).
export async function installBarcodeCamera(page, nativeSupport = 'missing', rotated = false, { code = '9781625275868', camera = 'on' } = {}) {
  await page.addInitScript(({ nativeSupport, rotated, code, camera }) => {
    const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const even = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    // The first digit selects the parity of the six left-hand digits (9: LGGLGL).
    const parities = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const invert = (bits) => [...bits].map((bit) => bit === '0' ? '1' : '0').join('');
    const barsFor = (value) => {
      if (!value) return ''; // An empty value draws no barcode.
      const parity = parities[Number(value[0])];
      return '101' + [...value.slice(1, 7)].map((digit, index) => (parity[index] === 'L' ? left : even)[Number(digit)]).join('')
        + '01010' + [...value.slice(7)].map((digit) => invert(left[Number(digit)])).join('') + '101';
    };
    window.__testBarcode = code;
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: nativeSupport === 'missing' ? undefined : class {
      static async getSupportedFormats() { return nativeSupport === 'formats' ? ['qr_code'] : ['ean_13']; }
      async detect() { throw new DOMException('Not supported', 'NotSupportedError'); }
    } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: camera === 'none' ? undefined : {
      getUserMedia: async () => {
        window.__testCameraRequests = (window.__testCameraRequests || 0) + 1;
        if (camera === 'denied' && !window.__testCameraAllow) throw new DOMException('Permission denied', 'NotAllowedError');
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        const draw = () => {
          context.fillStyle = 'white';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.save();
          if (rotated) {
            context.translate(640, 360);
            context.rotate(Math.PI / 2);
            context.translate(-640, -360);
          }
          context.fillStyle = 'black';
          [...barsFor(window.__testBarcode)].forEach((bit, index) => { if (bit === '1') context.fillRect(355 + index * 6, 220, 6, 280); });
          context.restore();
        };
        draw();
        const stream = canvas.captureStream(12);
        const timer = setInterval(draw, 80);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        window.__testCameraTrack = track;
        return stream;
      },
    } });
  }, { nativeSupport, rotated, code, camera });
}
