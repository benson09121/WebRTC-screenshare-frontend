import { describe, expect, test } from 'vitest';
import { getRoomLayoutState } from './roomLayout';

describe('room layout', () => {
  test('keeps camera-only calls in the participant grid', () => {
    expect(getRoomLayoutState({})).toEqual({
      hasSharedContent: false,
      showParticipantDock: false,
    });
  });

  test.each([
    { hasSharedContent: true, hasExternalWatchSession: false },
    { hasSharedContent: false, hasExternalWatchSession: true },
  ])('shows the participant dock for shared content', (state) => {
    expect(getRoomLayoutState(state).showParticipantDock).toBe(true);
  });

  test('hides only the participant dock in content focus mode', () => {
    expect(
      getRoomLayoutState({
        hasSharedContent: true,
        isPresentationMode: true,
      }),
    ).toEqual({
      hasSharedContent: true,
      showParticipantDock: false,
    });
  });
});
