import { AsyncLocalStorage } from "node:async_hooks";

// Only explicit audit/service calls use this transport. Existing app requests
// retain their transport and cache behavior.
export const connectorContext = new AsyncLocalStorage();
