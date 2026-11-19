// Interaction-state capture: default, hover, keyboard focus, pressed. Tight clipped screenshots plus a computed-style and pixel comparison.
const path = require('path'); const fs = require('fs');
const { STATES, ROOT } = require('./lib.cjs');
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'outlineStyle', 'outlineColor', 'outlineWidth', 'outlineOffset', 'transform', 'textDecorationLine', 'opacity', 'filter'];
const read = (loc) => loc.evaluate((el, PROPS) => { const s = getComputedStyle(el); const o = {}; for (const p of PROPS) o[p] = s[p]; o.cursor = s.cursor; const k = el.firstElementChild; if (k) { const ks = getComputedStyle(k); o.childTransform = ks.transform; o.childBoxShadow = ks.boxShadow; o.childOpacity = ks.opacity; } return o; }, PROPS);
const diff = (a, b) => Object.keys(a).filter(k => k !== 'cursor' && a[k] !== b[k]).map(k => `${k}: ${a[k]} -> ${b[k]}`);
async function states(page, name, loc, { pad = 10, park = null, note = '' } = {}) {
  const out = { control: name, note };
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
    const vp = page.viewportSize();
    const parkAt = park || [vp.width - 4, vp.height - 4];
    await page.mouse.move(parkAt[0], parkAt[1]);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.waitForTimeout(350);
    const box = await loc.boundingBox();
    out.size = Math.round(box.width) + 'x' + Math.round(box.height);
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2), height: Math.min(vp.height - Math.max(0, box.y - pad), box.height + pad * 2) };
    const snap = async st => { const f = path.join(STATES, `${name}-${st}.png`); return page.screenshot({ path: f, clip }); };
    const d0 = await read(loc); const b0 = await snap('default'); out.cursor = d0.cursor;
    // hover
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(450);
    const dh = await read(loc); const bh = await snap('hover');
    out.hoverCursor = dh.cursor; out.hoverStyle = diff(d0, dh); out.hoverPixelsChanged = !b0.equals(bh);
    // pressed
    await page.mouse.down(); await page.waitForTimeout(250);
    const dp = await read(loc); const bp = await snap('pressed');
    out.pressedStyle = diff(dh, dp); out.pressedPixelsChanged = !bh.equals(bp);
    await page.mouse.move(parkAt[0], parkAt[1]); await page.mouse.up(); await page.waitForTimeout(300);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    // keyboard focus: put the browser in keyboard modality, then focus the element
    await page.keyboard.press('Shift');
    await loc.evaluate(el => { el.focus({ focusVisible: true }); });
    await page.waitForTimeout(350);
    const df = await read(loc); const bf = await snap('focus');
    out.focusable = await loc.evaluate(el => document.activeElement === el);
    out.focusVisible = await loc.evaluate(el => el.matches(':focus-visible'));
    out.focusStyle = diff(d0, df); out.focusPixelsChanged = !b0.equals(bf);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  } catch (e) { out.error = e.message.split('\n')[0]; }
  fs.appendFileSync(path.join(ROOT, 'scripts', 'logs', 'states.jsonl'), JSON.stringify(out) + '\n');
  console.log('STATE', name, out.size, 'cursor', out.cursor, '| hover', out.hoverPixelsChanged ? 'changes' : 'NO CHANGE', (out.hoverStyle || []).length, '| pressed', out.pressedPixelsChanged ? 'changes' : 'NO CHANGE', '| focus', out.focusPixelsChanged ? 'changes' : 'NO CHANGE', out.focusable ? '' : 'NOT FOCUSABLE', out.error || '');
  return out;
}
module.exports = { states };
