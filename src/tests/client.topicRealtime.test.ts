import { shouldThrottleSocketTopicLoad } from '../client/components/RizzomaTopicDetail';

describe('topic realtime reload gating', () => {
  it('never drops a forced collaborator reload inside the old cooldown window', () => {
    expect(shouldThrottleSocketTopicLoad({
      force: true,
      fromSocket: true,
      lastCompleteTime: 9_000,
      now: 10_000,
    })).toBe(false);
  });

  it('still throttles non-forced socket noise inside the cooldown window', () => {
    expect(shouldThrottleSocketTopicLoad({
      force: false,
      fromSocket: true,
      lastCompleteTime: 9_000,
      now: 10_000,
    })).toBe(true);
  });
});
