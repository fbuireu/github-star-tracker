#!/usr/bin/env node
const { readdirSync, readFileSync, appendFileSync, statSync } = require('fs');
const { join } = require('path');

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
