import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('local entrypoint starts from the server workspace and serves the bundled catalog', { timeout: 15_000 }, async (t) => {
  const serverDirectory = fileURLToPath(new URL('.', import.meta.url));
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverDirectory,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  });

  const port = await new Promise((resolve, reject) => {
    let output = '';
    let diagnostics = '';
    const timer = setTimeout(() => finish(new Error('Local server did not become ready')), 10_000);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/Anonymous catalog server running on port (\d+)/);
      if (match) finish(null, Number(match[1]));
    };
    const onError = (error) => finish(error);
    const onExit = (code) => finish(new Error(`Local server exited before startup (${code}): ${diagnostics}`));
    const finish = (error, value) => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(value);
    };
    child.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-4000); });
    child.stdout.on('data', onData);
    child.once('error', onError);
    child.once('exit', onExit);
  });

  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const result = await fetch(`${base}/api/v2/libraries/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'Chennai' }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(result.status, 200);
  assert.ok((await result.json()).libraries.some((library) => library.name === 'Anna Centenary Library'));
});
