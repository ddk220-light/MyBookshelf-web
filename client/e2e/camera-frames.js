// EAN-13 image pixels, fed through a real canvas MediaStream and video element.
// Only camera hardware is replaced: the shipped decoder must read these bars.
export async function installBarcodeCamera(page, nativeSupport = 'missing', rotated = false) {
  await page.addInitScript(({ nativeSupport, rotated }) => {
    const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const even = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const isbn = '9781625275868';
    // First digit 9 selects LGGLGL parity for the six left-hand digits.
    const parity = 'LGGLGL';
    const invert = (bits) => [...bits].map((bit) => bit === '0' ? '1' : '0').join('');
    const bars = '101' + [...isbn.slice(1, 7)].map((digit, index) => (parity[index] === 'L' ? left : even)[Number(digit)]).join('')
      + '01010' + [...isbn.slice(7)].map((digit) => invert(left[Number(digit)])).join('') + '101';
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: nativeSupport === 'missing' ? undefined : class {
      static async getSupportedFormats() { return nativeSupport === 'formats' ? ['qr_code'] : ['ean_13']; }
      async detect() { throw new DOMException('Not supported', 'NotSupportedError'); }
    } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => {
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
          [...bars].forEach((bit, index) => { if (bit === '1') context.fillRect(355 + index * 6, 220, 6, 280); });
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
  }, { nativeSupport, rotated });
}
