#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  path.join(ROOT, 'node_modules'),
  path.join(ROOT, 'apps', 'server', 'node_modules'),
  path.join(ROOT, 'apps', 'server', 'dist'),
  path.join(ROOT, 'apps', 'web', 'node_modules'),
  path.join(ROOT, 'apps', 'web', 'dist'),
  path.join(ROOT, 'packages', 'shared', 'node_modules'),
  path.join(ROOT, 'packages', 'shared', 'dist'),
];

for (const target of targets) {
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`Cleaned: ${path.relative(ROOT, target)}`);
    } catch (err) {
      console.warn(`Failed to remove ${target}: ${err.message}`);
    }
  }
}
