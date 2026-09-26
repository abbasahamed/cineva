import { execSync } from 'child_process';
import fs from 'fs';

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

function resolveSystemBinary(name: 'ffmpeg' | 'ffprobe'): string | null {
  // 1. Try system PATH
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${whichCmd} ${name}`, { encoding: 'utf-8', timeout: 2000 }).trim();
    const firstLine = out.split('\n')[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // Not found via which
  }

  // 2. Check standard container / Nix / Linux paths
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

  // Fallback to @ffmpeg-installer/ffmpeg
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
      const p = String(ffmpegInstaller.path);
      cachedFfmpegPath = p;
      return p;
    }
  } catch {
    // Ignore installer errors
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

  // Fallback to @ffprobe-installer/ffprobe
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
    if (ffprobeInstaller?.path && fs.existsSync(ffprobeInstaller.path)) {
      const p = String(ffprobeInstaller.path);
      cachedFfprobePath = p;
      return p;
    }
  } catch {
    // Ignore installer errors
  }

  cachedFfprobePath = 'ffprobe';
  return 'ffprobe';
}
