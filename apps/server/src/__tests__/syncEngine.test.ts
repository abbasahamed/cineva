import { describe, it, expect, beforeEach } from 'vitest';
import { SynchronizationEngine } from '../services/syncEngine.js';
import { calculateExpectedPosition, calculateServerOffset, DEFAULT_DRIFT_CONFIG } from '@syncwatch/shared';

describe('SynchronizationEngine Unit Tests', () => {
  let engine: SynchronizationEngine;
  const testRoomId = 'test-room-123';

  beforeEach(() => {
    engine = new SynchronizationEngine();
  });

  it('should initialize default state as paused at 0s with version 1', () => {
    const state = engine.getOrCreateState(testRoomId);
    expect(state.isPlaying).toBe(false);
    expect(state.position).toBe(0);
    expect(state.playbackRate).toBe(1.0);
    expect(state.version).toBe(1);
  });

  it('should transition to PLAY and increment version', () => {
    const startTime = 1000000;
    const state = engine.play(testRoomId, 10.5, 1.0, startTime);

    expect(state.isPlaying).toBe(true);
    expect(state.position).toBe(10.5);
    expect(state.lastUpdatedAt).toBe(startTime);
    expect(state.version).toBe(2);
  });

  it('should calculate expected playback position accurately over elapsed time', () => {
    const startTime = 1000000;
    engine.play(testRoomId, 50.0, 1.0, startTime);

    // 5.5 seconds later
    const fiveSecondsLater = startTime + 5500;
    const currentPosition = engine.calculateCurrentPosition(testRoomId, fiveSecondsLater);

    expect(currentPosition).toBeCloseTo(55.5, 2);
  });

  it('should account for custom playback rate (e.g. 1.5x) when calculating position', () => {
    const startTime = 1000000;
    engine.play(testRoomId, 10.0, 1.5, startTime);

    // 10 seconds later at 1.5x rate should advance 15 seconds
    const tenSecondsLater = startTime + 10000;
    const currentPosition = engine.calculateCurrentPosition(testRoomId, tenSecondsLater);

    expect(currentPosition).toBeCloseTo(25.0, 2);
  });

  it('should freeze position when transitioning to PAUSE', () => {
    const startTime = 1000000;
    engine.play(testRoomId, 0, 1.0, startTime);

    // Pause 10 seconds later
    const pauseTime = startTime + 10000;
    const pausedState = engine.pause(testRoomId, undefined, pauseTime);

    expect(pausedState.isPlaying).toBe(false);
    expect(pausedState.position).toBeCloseTo(10.0, 2);
    expect(pausedState.version).toBe(3);

    // Subsequent time elapsed should NOT advance position
    const futureTime = pauseTime + 50000;
    expect(engine.calculateCurrentPosition(testRoomId, futureTime)).toBeCloseTo(10.0, 2);
  });

  it('should update position on SEEK without changing playing state', () => {
    const startTime = 1000000;
    engine.play(testRoomId, 20.0, 1.0, startTime);

    const seekTime = startTime + 5000;
    const seekState = engine.seek(testRoomId, 120.0, seekTime);

    expect(seekState.position).toBe(120.0);
    expect(seekState.lastUpdatedAt).toBe(seekTime);
    expect(seekState.isPlaying).toBe(true);

    // 2 seconds later should be 122.0
    expect(engine.calculateCurrentPosition(testRoomId, seekTime + 2000)).toBeCloseTo(122.0, 2);
  });

  it('should compute join-in-progress synchronization accurately for late-joining guests', () => {
    const startTime = 1000000;
    engine.play(testRoomId, 120.0, 1.0, startTime);

    // Guest joins 5 seconds later
    const guestJoinTime = startTime + 5000;
    const snapshot = engine.getSnapshot(testRoomId, guestJoinTime);

    // Guest should immediately receive position ~ 125.0
    expect(snapshot.playback.isPlaying).toBe(true);
    expect(snapshot.playback.position).toBeCloseTo(125.0, 2);
    expect(snapshot.serverTimestamp).toBe(guestJoinTime);
  });

  it('should satisfy Section 25 Deterministic Synchronization progression test', () => {
    // Initial: position = 100, playing = true, rate = 1.0, lastUpdatedAt = 100000
    const startT = 100000;
    engine.play(testRoomId, 100.0, 1.0, startT);

    // At serverNow = 105000 (5s elapsed @ 1.0x): Expected position = 105
    const posAt105k = engine.calculateCurrentPosition(testRoomId, 105000);
    expect(posAt105k).toBeCloseTo(105.0, 3);

    // Then: rate = 1.5 at time 105000
    engine.setPlaybackRate(testRoomId, 1.5, 105000);

    // 2 seconds later at time 107000 (2s elapsed @ 1.5x = +3s): Expected position = 108
    const posAt107k = engine.calculateCurrentPosition(testRoomId, 107000);
    expect(posAt107k).toBeCloseTo(108.0, 3);

    // Then: playing = false (pause at 107000)
    engine.pause(testRoomId, undefined, 107000);

    // Expected: position remains fixed at 108 even 30 seconds later
    const posAtFuture = engine.calculateCurrentPosition(testRoomId, 137000);
    expect(posAtFuture).toBeCloseTo(108.0, 3);
  });
});

describe('NTP Clock Synchronization & Drift Correction Helpers', () => {
  it('should compute correct server clock offset from ping/pong timestamps', () => {
    const clientSendTime = 1000;
    const serverReceiveTime = 1050; // Server is +30ms ahead (roundtrip 40ms)
    const clientReceiveTime = 1040; // Total RTT = 40ms, half-trip = 20ms

    const offset = calculateServerOffset(clientSendTime, serverReceiveTime, clientReceiveTime);
    // serverOffset = 1050 - (1000 + 20) = +30ms
    expect(offset).toBe(30);
  });

  it('should correctly calculate expected position using shared helper', () => {
    const playback = {
      isPlaying: true,
      position: 10,
      lastUpdatedAt: 100000,
      playbackRate: 1.0,
      version: 5,
    };

    const currentServerTime = 102500; // 2.5 seconds later
    const expected = calculateExpectedPosition(playback, currentServerTime);
    expect(expected).toBe(12.5);
  });

  it('should verify drift threshold boundaries', () => {
    expect(DEFAULT_DRIFT_CONFIG.minThreshold).toBe(0.25);
    expect(DEFAULT_DRIFT_CONFIG.maxThreshold).toBe(1.0);
  });
});
