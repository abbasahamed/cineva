import { PlaybackState } from '@syncwatch/shared';

export class SynchronizationEngine {
  private roomStates: Map<string, PlaybackState> = new Map();

  /**
   * Initializes or gets the playback state for a room.
   */
  getOrCreateState(roomId: string): PlaybackState {
    let state = this.roomStates.get(roomId);
    if (!state) {
      state = {
        isPlaying: false,
        position: 0,
        lastUpdatedAt: Date.now(),
        playbackRate: 1.0,
        version: 1,
      };
      this.roomStates.set(roomId, state);
    }
    return state;
  }

  /**
   * Calculates the exact authoritative playback position at this moment in time.
   */
  calculateCurrentPosition(roomId: string, now: number = Date.now()): number {
    const state = this.getOrCreateState(roomId);
    if (!state.isPlaying) {
      return state.position;
    }
    const elapsedSeconds = ((now - state.lastUpdatedAt) / 1000) * state.playbackRate;
    return Math.max(0, state.position + elapsedSeconds);
  }

  /**
   * Returns a snapshot of the current state with calculated position and server timestamp.
   */
  getSnapshot(roomId: string, now: number = Date.now()): { playback: PlaybackState; serverTimestamp: number } {
    const state = this.getOrCreateState(roomId);
    return {
      playback: {
        ...state,
        position: this.calculateCurrentPosition(roomId, now),
      },
      serverTimestamp: now,
    };
  }

  /**
   * Transitions playback to PLAY.
   */
  play(roomId: string, clientReportedPosition?: number, playbackRate?: number, now: number = Date.now()): PlaybackState {
    const state = this.getOrCreateState(roomId);
    
    // If client supplied a position (e.g. Host clicked play at specific position), update position
    const currentPosition = typeof clientReportedPosition === 'number' && !isNaN(clientReportedPosition)
      ? Math.max(0, clientReportedPosition)
      : this.calculateCurrentPosition(roomId, now);

    state.isPlaying = true;
    state.position = currentPosition;
    state.lastUpdatedAt = now;
    if (typeof playbackRate === 'number' && playbackRate > 0) {
      state.playbackRate = playbackRate;
    }
    state.version += 1;

    return { ...state };
  }

  /**
   * Transitions playback to PAUSE.
   */
  pause(roomId: string, clientReportedPosition?: number, now: number = Date.now()): PlaybackState {
    const state = this.getOrCreateState(roomId);

    const currentPosition = typeof clientReportedPosition === 'number' && !isNaN(clientReportedPosition)
      ? Math.max(0, clientReportedPosition)
      : this.calculateCurrentPosition(roomId, now);

    state.isPlaying = false;
    state.position = currentPosition;
    state.lastUpdatedAt = now;
    state.version += 1;

    return { ...state };
  }

  /**
   * Authoritative SEEK to a new position.
   */
  seek(roomId: string, newPosition: number, now: number = Date.now()): PlaybackState {
    const state = this.getOrCreateState(roomId);

    state.position = Math.max(0, newPosition);
    state.lastUpdatedAt = now;
    state.version += 1;

    return { ...state };
  }

  /**
   * Authoritative PLAYBACK RATE change.
   */
  setPlaybackRate(roomId: string, rate: number, now: number = Date.now()): PlaybackState {
    const state = this.getOrCreateState(roomId);

    // Freeze current position before rate change
    const currentPosition = this.calculateCurrentPosition(roomId, now);
    state.position = currentPosition;
    state.playbackRate = Math.min(4.0, Math.max(0.25, rate));
    state.lastUpdatedAt = now;
    state.version += 1;

    return { ...state };
  }

  /**
   * Clean up state on room end.
   */
  removeRoom(roomId: string): void {
    this.roomStates.delete(roomId);
  }
}

export const syncEngine = new SynchronizationEngine();
