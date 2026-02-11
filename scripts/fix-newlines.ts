#!/usr/bin/env tsx
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

readdirSync(distDir).forEach((file) => {
  const filePath = join(distDir, file);
  if (statSync(filePath).isFile()) {
    const content = readFileSync(filePath);
    if (content.length > 0 && content[content.length - 1] !== 10) {
      appendFileSync(filePath, '\n');
    }
  }
});
