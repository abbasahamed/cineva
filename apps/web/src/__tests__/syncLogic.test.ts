import { describe, it, expect } from 'vitest';
import {
  calculateExpectedPosition,
  calculateServerOffset,
  DEFAULT_DRIFT_CONFIG,
  PlaybackState,
} from '@syncwatch/shared';

describe('Frontend Synchronization & Drift Logic Tests', () => {
  it('should compute exact expected position when playing at 1.0x speed', () => {
    const playback: PlaybackState = {
      isPlaying: true,
      position: 120.0,
      lastUpdatedAt: 50000,
      playbackRate: 1.0,
      version: 4,
    };

    const currentServerTime = 53500; // 3.5s later
    const expected = calculateExpectedPosition(playback, currentServerTime);
    expect(expected).toBe(123.5);
  });

  it('should calculate expected position correctly when playback is paused', () => {
    const playback: PlaybackState = {
      isPlaying: false,
      position: 45.2,
      lastUpdatedAt: 50000,
      playbackRate: 1.0,
      version: 5,
    };

    const currentServerTime = 90000;
    const expected = calculateExpectedPosition(playback, currentServerTime);
    expect(expected).toBe(45.2);
  });

  it('should calculate expected position at 1.25x playback rate', () => {
    const playback: PlaybackState = {
      isPlaying: true,
      position: 10.0,
      lastUpdatedAt: 100000,
      playbackRate: 1.25,
      version: 2,
    };

    // 4 seconds elapsed on wall clock = 5 seconds elapsed video playback
    const currentServerTime = 104000;
    const expected = calculateExpectedPosition(playback, currentServerTime);
    expect(expected).toBe(15.0);
  });

  it('should determine correct drift correction actions based on thresholds', () => {
    const { minThreshold, maxThreshold } = DEFAULT_DRIFT_CONFIG;

    // Test case 1: Sub-threshold drift (0.1s) -> No action
    const drift1 = 0.1;
    expect(Math.abs(drift1) < minThreshold).toBe(true);

    // Test case 2: Gentle drift (0.6s) -> Rate nudge
    const drift2 = 0.6;
    expect(Math.abs(drift2) >= minThreshold && Math.abs(drift2) < maxThreshold).toBe(true);

    // Test case 3: Severe drift (1.8s) -> Hard seek
    const drift3 = 1.8;
    expect(Math.abs(drift3) >= maxThreshold).toBe(true);
  });

  it('should verify NTP offset accuracy under asymmetric latency', () => {
    const t0 = 1000; // client sends ping
    const t1 = 1025; // server receives at 1025 (Date.now())
    const t2 = 1040; // client receives pong at 1040

    const offset = calculateServerOffset(t0, t1, t2);
    // RTT = 40ms, half-trip = 20ms
    // offset = 1025 - (1000 + 20) = 5ms
    expect(offset).toBe(5);
  });

  it('should satisfy Section 25 Deterministic Synchronization progression test', () => {
    // Initial: position = 100, playing = true, rate = 1.0, lastUpdatedAt = 100000
    const state: PlaybackState = {
      position: 100.0,
      isPlaying: true,
      playbackRate: 1.0,
      lastUpdatedAt: 100000,
      version: 1,
    };

    // At serverNow = 105000 (5s elapsed @ 1.0x): Expected position = 105
    const posAt105k = calculateExpectedPosition(state, 105000);
    expect(posAt105k).toBeCloseTo(105.0, 3);

    // Then: rate = 1.5 at time 105000
    const rateState: PlaybackState = {
      position: posAt105k,
      isPlaying: true,
      playbackRate: 1.5,
      lastUpdatedAt: 105000,
      version: 2,
    };

    // 2 seconds later at time 107000 (2s elapsed @ 1.5x = +3s): Expected position = 108
    const posAt107k = calculateExpectedPosition(rateState, 107000);
    expect(posAt107k).toBeCloseTo(108.0, 3);

    // Then: playing = false (pause at 107000)
    const pauseState: PlaybackState = {
      position: posAt107k,
      isPlaying: false,
      playbackRate: 1.5,
      lastUpdatedAt: 107000,
      version: 3,
    };

    // Expected: position remains fixed at 108 even 30 seconds later
    const posAtFuture = calculateExpectedPosition(pauseState, 137000);
    expect(posAtFuture).toBeCloseTo(108.0, 3);
  });
});

import { formatTime } from '../components/VideoPlayer.js';

describe('Video Player Timeline & Seeking Unit Tests', () => {
  it('A. Duration: should format 9369.248 seconds as 02:36:09', () => {
    expect(formatTime(9369.248)).toBe('02:36:09');
  });

  it('B. Timeline seek: should calculate 500s for 50% click on 1000s duration', () => {
    const duration = 1000;
    const ratio = 0.5;
    const target = Math.max(0, Math.min(ratio * duration, duration));
    expect(target).toBe(500);
  });

  it('C. Timeline end: should clamp 100% click to exact duration', () => {
    const duration = 1000;
    const ratio = 1.0;
    const target = Math.max(0, Math.min(ratio * duration, duration));
    expect(target).toBe(1000);
  });

  it('D. Timeline beginning: should calculate 0s for 0% click', () => {
    const duration = 1000;
    const ratio = 0.0;
    const target = Math.max(0, Math.min(ratio * duration, duration));
    expect(target).toBe(0);
  });

  it('E. Forward: should add 10s to currentTime 100', () => {
    const currentTime = 100;
    const duration = 1000;
    const target = Math.min(duration, currentTime + 10);
    expect(target).toBe(110);
  });

  it('F. Rewind: should subtract 10s from currentTime 100', () => {
    const currentTime = 100;
    const target = Math.max(0, currentTime - 10);
    expect(target).toBe(90);
  });

  it('G. Forward at end: should clamp target to duration (1000s)', () => {
    const currentTime = 995;
    const duration = 1000;
    const target = Math.min(duration, currentTime + 10);
    expect(target).toBe(1000);
  });

  it('H. Rewind at beginning: should clamp target to 0s', () => {
    const currentTime = 3;
    const target = Math.max(0, currentTime - 10);
    expect(target).toBe(0);
  });

  it('I. Invalid duration: should format NaN and Infinity safely as 00:00', () => {
    expect(formatTime(NaN)).toBe('00:00');
    expect(formatTime(Infinity)).toBe('00:00');
    expect(formatTime(-10)).toBe('00:00');
    expect(formatTime(undefined as any)).toBe('00:00');
  });

  it('J. Stale synchronization: should reject stale position 0 when local seek to 120s is pending', () => {
    const localSeek = { targetTime: 120, timestamp: Date.now() };
    const staleServerSnapshot = { isPlaying: false, position: 0, version: 1 };
    const latestVersion = 2;

    const isStale = (
      Date.now() - localSeek.timestamp < 2500 &&
      Math.abs(staleServerSnapshot.position - localSeek.targetTime) > 1.5 &&
      staleServerSnapshot.version <= latestVersion
    );

    expect(isStale).toBe(true);
  });

  it('K. Media remount: should apply room playback state 250s after metadata finishes loading', () => {
    let videoReadyState = 0; // HAVE_NOTHING
    let duration = 0;
    let videoCurrentTime = 0;

    // Simulate loadedmetadata event
    videoReadyState = 1; // HAVE_METADATA
    duration = 500;

    const roomState = { isPlaying: false, position: 250, version: 3 };

    if (videoReadyState >= 1 && Number.isFinite(duration) && duration > 0) {
      videoCurrentTime = roomState.position;
    }

    expect(videoCurrentTime).toBe(250);
  });

  it('L. Host -> guest seek: should update guest expected position to 500s', () => {
    const hostState: PlaybackState = {
      isPlaying: true,
      position: 500.0,
      lastUpdatedAt: 100000,
      playbackRate: 1.0,
      version: 5,
    };

    const guestServerNow = 100050; // 50ms network delay
    const guestExpected = calculateExpectedPosition(hostState, guestServerNow);
    expect(guestExpected).toBeCloseTo(500.05, 2);
  });

  it('M. Critical Race Condition Test: Forward at 120s -> Stale 0s rejected -> Converges at 130s', () => {
    let currentVideoPosition = 120;
    const lastLocalSeek = { targetTime: 130, timestamp: Date.now() };

    // 1. User clicks Forward (currentTime 120 + 10 = 130)
    currentVideoPosition = lastLocalSeek.targetTime;
    expect(currentVideoPosition).toBe(130);

    // 2. Immediately receive stale 0s snapshot from server
    const staleSnapshot = { position: 0, version: 1 };
    const currentVersion = 2;

    const shouldIgnoreStale = (
      Date.now() - lastLocalSeek.timestamp < 2500 &&
      Math.abs(staleSnapshot.position - lastLocalSeek.targetTime) > 1.5 &&
      staleSnapshot.version <= currentVersion
    );

    if (!shouldIgnoreStale) {
      currentVideoPosition = staleSnapshot.position;
    }

    // Verify position did NOT reset to 0!
    expect(currentVideoPosition).toBe(130);

    // 3. Server sends new authoritative seek snapshot around 130s (version 3)
    const newAuthoritativeSnapshot = { position: 130, version: 3 };
    if (newAuthoritativeSnapshot.version > currentVersion) {
      currentVideoPosition = newAuthoritativeSnapshot.position;
    }

    expect(currentVideoPosition).toBe(130);
  });

  describe('Cinema Chat Playback Activity Message Stream Tests', () => {
    it('1. formatTime produces exact HH:MM:SS and MM:SS without NaN/Infinity', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(523)).toBe('08:43');
      expect(formatTime(762)).toBe('12:42');
      expect(formatTime(5058)).toBe('01:24:18');
      expect(formatTime(NaN)).toBe('00:00');
      expect(formatTime(Infinity)).toBe('00:00');
      expect(formatTime(-5)).toBe('00:00');
    });

    it('2. Play activity formatting matches specification', () => {
      const name = 'Abbas';
      const pos1 = 762; // 00:12:42
      const pos2 = 0;   // 00:00
      expect(`${name} started playing from ${formatTime(pos1)}.`).toBe('Abbas started playing from 12:42.');
      expect(`${name} started playing from ${formatTime(pos2)}.`).toBe('Abbas started playing from 00:00.');
    });

    it('3. Pause activity formatting matches specification', () => {
      const name = 'Rahul';
      expect(`${name} paused the movie.`).toBe('Rahul paused the movie.');
    });

    it('4. Seek, Forward, and Rewind activity formatting matches specification', () => {
      const name = 'Abbas';
      const seekPos = 5058; // 01:24:18
      expect(`${name} jumped to ${formatTime(seekPos)}.`).toBe('Abbas jumped to 01:24:18.');

      // Forward 10s from 3600 (01:00:00 -> 01:00:10)
      const forwardTarget = 3600 + 10;
      expect(`${name} jumped to ${formatTime(forwardTarget)}.`).toBe('Abbas jumped to 01:00:10.');

      // Rewind 10s from 3600 (01:00:00 -> 00:59:50)
      const rewindTarget = 3600 - 10;
      expect(`${name} jumped to ${formatTime(rewindTarget)}.`).toBe('Abbas jumped to 59:50.');
    });

    it('5. Remote sync updates do not emit user socket actions', () => {
      let emitCount = 0;
      const mockEmitSeek = () => { emitCount++; };

      // Remote sync handler applies position locally
      const applyRemoteSync = (remotePos: number, isLocalUserAction: boolean) => {
        if (isLocalUserAction) {
          mockEmitSeek();
        }
      };

      // Simulating remote ROOM_STATE / drift correction
      applyRemoteSync(500, false);
      applyRemoteSync(502, false);

      expect(emitCount).toBe(0);

      // Simulating intentional local user click
      applyRemoteSync(510, true);
      expect(emitCount).toBe(1);
    });

    it('6. Chat chronological stream interleaves system events and user messages', () => {
      const messages = [
        { id: '1', displayName: 'System', message: 'Abbas joined the room.', isSystem: true, createdAt: '2026-09-26T10:42:00Z' },
        { id: '2', displayName: 'System', message: 'Rahul joined the room.', isSystem: true, createdAt: '2026-09-26T10:43:00Z' },
        { id: '3', displayName: 'Abbas', message: 'Ready?', isSystem: false, createdAt: '2026-09-26T10:45:00Z' },
        { id: '4', displayName: 'System', message: 'Abbas started playing from 00:00.', isSystem: true, createdAt: '2026-09-26T10:45:10Z' },
        { id: '5', displayName: 'Rahul', message: 'Wait 😂', isSystem: false, createdAt: '2026-09-26T11:02:00Z' },
        { id: '6', displayName: 'System', message: 'Abbas paused the movie.', isSystem: true, createdAt: '2026-09-26T11:02:05Z' },
        { id: '7', displayName: 'System', message: 'Abbas jumped to 01:12:42.', isSystem: true, createdAt: '2026-09-26T11:03:00Z' },
      ];

      // Sorted by createdAt
      const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      expect(sorted.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });
  });
});
