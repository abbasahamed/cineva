import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function getFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
        files.push(...getFiles(fullPath));
      }
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('STEP 3: Prototype & Demo Artifacts Regression Suite', () => {
  const srcDir = path.resolve(__dirname, '..');
  const srcFiles = getFiles(srcDir);

  it('ensures no hardcoded "A7K9PX" invite code exists in apps/web/src', () => {
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toContain('A7K9PX');
    }
  });

  it('ensures no mock participant "Maya" exists in apps/web/src', () => {
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toContain('Maya');
    }
  });

  it('ensures no mock participant "Dev" or "Dev (Demo)" exists in apps/web/src', () => {
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/['">]Dev['"<]/);
      expect(content).not.toContain('Dev (Demo)');
    }
  });

  it('ensures no "Demo" badge, tag, or className="demo" exists in apps/web/src', () => {
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/className=["']demo["']/);
      expect(content).not.toContain('(Demo)');
      expect(content).not.toContain('<em className="demo">');
    }
  });

  it('ensures no hardcoded "3 in the call" string exists in apps/web/src', () => {
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toContain('3 in the call');
    }
  });
});
