declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

export function waitUntil(promise: Promise<unknown>): void {
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((error) => {
    console.error("Background task failed:", error);
  });
}
