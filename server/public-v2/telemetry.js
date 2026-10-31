const ALLOWED_EVENT_KEYS = new Set([
  'operation',
  'provider',
  'outcome',
  'durationMs',
  'errorCode',
  'parserConfidence',
]);

const BLOCKED_KEY = /(query|search|credential|password|pin|card|cookie|history|recent|ip|address|location|url|path|header)/i;

function assertSafeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('Telemetry event must be an object');
  }
  for (const [key, value] of Object.entries(event)) {
    if (!ALLOWED_EVENT_KEYS.has(key) || BLOCKED_KEY.test(key)) {
      throw new TypeError(`Telemetry field is not permitted: ${key}`);
    }
    if (typeof value === 'string' && /(https?:\/\/|cookie\s*:|bearer\s+|isbn\s*:)/i.test(value)) {
      throw new TypeError(`Telemetry value is not permitted: ${key}`);
    }
  }
  if (typeof event.operation !== 'string' || event.operation.length > 64) {
    throw new TypeError('Telemetry operation is required');
  }
  if (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0)) {
    throw new TypeError('Telemetry duration must be a non-negative number');
  }
}

// Test and development sink only. Production wiring may forward only this same
// allowlisted shape to its metrics backend.
export function createRedactedTelemetrySink({ maxEvents = 1_000 } = {}) {
  const events = [];
  return Object.freeze({
    emit(event) {
      assertSafeEvent(event);
      events.push(Object.freeze({ ...event }));
      if (events.length > maxEvents) events.shift();
    },
    events() {
      return [...events];
    },
  });
}
