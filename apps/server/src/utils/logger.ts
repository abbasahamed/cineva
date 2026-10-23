/**
 * Structured Logging Utility for Cineva.
 *
 * Logs operational and lifecycle events with timestamps and sanitized context.
 * Complies with Section 18: Never logs private session secrets, tokens, or raw user chat messages.
 */

export interface LogContext {
  [key: string]: unknown;
}

function formatLog(level: 'INFO' | 'WARN' | 'ERROR', event: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  // Sanitize any accidentally passed sensitive keys
  const sanitizedContext: LogContext = {};
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (/secret|token|password|cookie|authorization/i.test(key)) {
        sanitizedContext[key] = '[REDACTED]';
      } else {
        sanitizedContext[key] = value;
      }
    }
  }

  return JSON.stringify({
    timestamp,
    level,
    event,
    ...sanitizedContext,
  });
}

export const logger = {
  info(event: string, context?: LogContext) {
    console.log(formatLog('INFO', event, context));
  },

  warn(event: string, context?: LogContext) {
    console.warn(formatLog('WARN', event, context));
  },

  error(event: string, context?: LogContext) {
    console.error(formatLog('ERROR', event, context));
  },

  // Specialized lifecycle events
  roomCreated(roomCode: string, name: string, isDemo: boolean = false) {
    this.info('room_created', { roomCode, name, isDemo });
  },

  participantJoined(roomCode: string, displayName: string, isHost: boolean) {
    this.info('participant_joined', { roomCode, displayName, isHost });
  },

  participantDisconnected(roomCode: string, displayName?: string) {
    this.info('participant_disconnected', { roomCode, displayName });
  },

  mediaUploaded(roomCode: string, filename: string, sizeBytes: number) {
    this.info('media_uploaded', {
      roomCode,
      filename,
      sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
    });
  },

  roomEnded(roomCode: string) {
    this.info('room_ended', { roomCode });
  },

  socketError(event: string, errorMsg: string) {
    this.error('socket_error', { event, message: errorMsg });
  },
};
