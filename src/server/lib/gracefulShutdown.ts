export type GracefulShutdownSteps = {
  closeSocket: () => Promise<void>;
  httpClosed: Promise<void>;
  flushCollaborativeState: () => Promise<void>;
  closeSessionStore: () => Promise<void>;
};

/**
 * Stop realtime ingress, then drain HTTP sessions and persist collaborative
 * state concurrently. Redis must remain open until every in-flight HTTP
 * request has had a chance to write its session.
 */
export async function drainAndFlushForShutdown(steps: GracefulShutdownSteps): Promise<void> {
  await steps.closeSocket();

  const results = await Promise.allSettled([
    steps.httpClosed,
    steps.flushCollaborativeState(),
  ]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;

  await steps.closeSessionStore();
}
