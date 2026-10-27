import { execSync } from 'child_process';
import fs from 'fs';

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

function resolveSystemBinary(name: 'ffmpeg' | 'ffprobe'): string | null {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${whichCmd} ${name}`, { encoding: 'utf-8', timeout: 2000 }).trim();
    const firstLine = out.split('\n')[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
  }

  const candidatePaths = [
    `/usr/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/nix/var/nix/profiles/default/bin/${name}`,
    `/root/.nix-profile/bin/${name}`,
  ];
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  const systemPath = resolveSystemBinary('ffmpeg');
  if (systemPath) {
    cachedFfmpegPath = systemPath;
    return systemPath;
  }

  cachedFfmpegPath = 'ffmpeg';
  return 'ffmpeg';
}

export function getFfprobePath(): string {
  if (cachedFfprobePath) return cachedFfprobePath;

  const systemPath = resolveSystemBinary('ffprobe');
  if (systemPath) {
    cachedFfprobePath = systemPath;
    return systemPath;
  }

  cachedFfprobePath = 'ffprobe';
  return 'ffprobe';
}
