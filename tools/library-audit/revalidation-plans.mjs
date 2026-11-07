import { hash } from "../../server/services/catalog-connectors/contracts.js";

// Only effective inputs define a new attempt. Updating review dates, rationale
// or report metadata must not cause another provider request.
export function revalidationAttemptKey(libraryId, implementationHash, plan) {
  return hash({ libraryId, implementationHash, queries: plan?.queries || [] });
}

export function completedRevalidationKeys(events) {
  return new Set(
    events
      .filter((event) => event.type === "revalidation_attempt_completed")
      .map(
        (event) =>
          event.attemptKey ||
          revalidationAttemptKey(
            event.libraryId,
            event.implementationHash,
            null,
          ),
      ),
  );
}
