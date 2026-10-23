import { customAlphabet } from 'nanoid';

// Unambiguous character set (no 0/O, 1/I/L)
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const generateShortCode = customAlphabet(alphabet, 6);
const generateToken = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 32);

export function generateRoomCode(): string {
  return generateShortCode();
}

export function generateSessionId(): string {
  return 'cineva_sess_' + generateToken();
}

export function generateId(prefix: string = 'sw'): string {
  return `${prefix}_${generateToken()}`;
}
