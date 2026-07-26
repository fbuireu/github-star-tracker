import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
const SOURCE_PATH_PATTERN = /`(src\/[\w./-]+\.ts)`/g;
const TEST_FILE_PATTERN = /`([\w-]+\.test\.ts)`/g;
const SVG_LINK_PATTERN = /\]\(([\w.-]+\.svg)\)/g;
const OUTPUT_KEY_PATTERN = /^ {2}([a-z][a-z-]*):$/gm;

const DOC_ROOTS = ['ARCHITECTURE.md', 'CONTEXT.md', 'README.md', 'examples/README.md'];
const DOC_GLOBS = ['docs/adr', 'docs/wiki'];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return walk(full);

    return entry.name.endsWith('.md') ? [full] : [];
  });
}

function layerDocs(dir = 'src'): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return layerDocs(full);

    return entry.name === 'CLAUDE.md' ? [full] : [];
  });
}

const DOCS = [
  ...DOC_ROOTS.filter((doc) => fs.existsSync(doc)),
  ...DOC_GLOBS.flatMap((dir) => walk(dir)),
  ...layerDocs(),
];

function read(doc: string): string {
  return fs.readFileSync(doc, 'utf8');
}

function matchesIn(doc: string, pattern: RegExp): string[] {
  return [...read(doc).matchAll(pattern)].map((match) => match[1]);
}

describe('documentation consistency', () => {
  it('finds the documentation set it is meant to guard', () => {
    expect(DOCS.length).toBeGreaterThan(20);
  });

  it.each(DOCS)('%s links only to files that exist', (doc) => {
    const broken = matchesIn(doc, MARKDOWN_LINK_PATTERN)
      .filter((target) => target.endsWith('.md') || target.includes('.md#'))
      .filter((target) => !target.startsWith('http'))
      .map((target) => target.split('#')[0])
      .filter((target) => !fs.existsSync(path.resolve(path.dirname(doc), target)));

    expect(broken).toEqual([]);
  });

  it.each(DOCS)('%s cites only source files that exist', (doc) => {
    const missing = matchesIn(doc, SOURCE_PATH_PATTERN).filter((cited) => !fs.existsSync(cited));

    expect([...new Set(missing)]).toEqual([]);
  });

  it.each(DOCS)('%s cites only test files that exist', (doc) => {
    const allTests = new Set(
      walkSources('src')
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => path.basename(file)),
    );
    const missing = matchesIn(doc, TEST_FILE_PATTERN).filter((cited) => !allTests.has(cited));

    expect([...new Set(missing)]).toEqual([]);
  });

  it('examples/README.md embeds only sample charts that exist', () => {
    const missing = matchesIn('examples/README.md', SVG_LINK_PATTERN).filter(
      (svg) => !fs.existsSync(path.join('examples', svg)),
    );

    expect(missing).toEqual([]);
  });
});

function walkSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? walkSources(full) : [full];
  });
}

const OUTPUT_SURFACES = [
  'README.md',
  'docs/wiki/API-Reference.md',
  'docs/wiki/Viewing-Reports.md',
  'src/application/CLAUDE.md',
];

const declaredOutputs = [
  ...read('action.yml').split('\noutputs:')[1].matchAll(OUTPUT_KEY_PATTERN),
].map((match) => match[1]);

describe('action outputs are documented everywhere they are listed', () => {
  it('reads the outputs block', () => {
    expect(declaredOutputs.length).toBeGreaterThan(0);
  });

  it.each(OUTPUT_SURFACES)('%s names every declared output', (surface) => {
    const text = read(surface);
    const undocumented = declaredOutputs.filter((output) => !text.includes(`\`${output}\``));

    expect(undocumented).toEqual([]);
  });
});

interface ActionManifest {
  inputs: Record<string, { description: string; default?: string }>;
}

const manifest = yaml.load(read('action.yml')) as ActionManifest;

describe('action inputs are documented', () => {
  it.each(Object.keys(manifest.inputs))('%s is documented in the wiki', (input) => {
    const configured = read('docs/wiki/Configuration.md');
    const referenced = read('docs/wiki/API-Reference.md');

    expect(configured.includes(`\`${input}\``) || referenced.includes(`\`${input}\``)).toBe(true);
  });
});
