import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
const SOURCE_PATH_PATTERN = /`(src\/[\w./-]+\.ts)`/g;
const TEST_FILE_PATTERN = /`([\w-]+\.test\.ts)`/g;
const SVG_LINK_PATTERN = /\]\(([\w.-]+\.svg)\)/g;
const OUTPUT_KEY_PATTERN = /^ {2}([a-z][a-z-]*):$/gm;

const OUTPUT_SURFACES = [
  'README.md',
  'docs/wiki/API-Reference.md',
  'docs/wiki/Viewing-Reports.md',
  'src/application/CLAUDE.md',
];

const MIN_EXPECTED_DOCS = 20;

function walk(dir: string, keep: (filename: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return walk(full, keep);

    return keep(entry.name) ? [full] : [];
  });
}

const isMarkdown = (filename: string): boolean => filename.endsWith('.md');

const DOCS = [
  ...['ARCHITECTURE.md', 'CONTEXT.md', 'README.md', 'examples/README.md'].filter((doc) =>
    fs.existsSync(doc),
  ),
  ...walk('docs', isMarkdown),
  ...walk('src', (filename) => filename === 'CLAUDE.md'),
];

const TEST_FILENAMES = new Set(
  walk('src', (filename) => filename.endsWith('.test.ts')).map((file) => path.basename(file)),
);

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

interface CollectParams {
  pattern: RegExp;
  isBroken: (match: string, doc: string) => boolean;
}

function collect({ pattern, isBroken }: CollectParams): string[] {
  return DOCS.flatMap((doc) =>
    [...read(doc).matchAll(pattern)]
      .map((match) => match[1])
      .filter((match) => isBroken(match, doc))
      .map((match) => `${doc} -> ${match}`),
  );
}

describe('documentation consistency', () => {
  it('guards the whole documentation set', () => {
    expect(DOCS.length).toBeGreaterThan(MIN_EXPECTED_DOCS);
  });

  it('links only to files that exist', () => {
    const broken = collect({
      pattern: MARKDOWN_LINK_PATTERN,
      isBroken: (target, doc) =>
        !target.startsWith('http') &&
        target.includes('.md') &&
        !fs.existsSync(path.resolve(path.dirname(doc), target.split('#')[0])),
    });

    expect(broken).toEqual([]);
  });

  it('cites only source files that exist', () => {
    const missing = collect({
      pattern: SOURCE_PATH_PATTERN,
      isBroken: (cited) => !fs.existsSync(cited),
    });

    expect(missing).toEqual([]);
  });

  it('cites only test files that exist', () => {
    const missing = collect({
      pattern: TEST_FILE_PATTERN,
      isBroken: (cited) => !TEST_FILENAMES.has(cited),
    });

    expect(missing).toEqual([]);
  });

  it('embeds only sample charts that exist', () => {
    const missing = [...read('examples/README.md').matchAll(SVG_LINK_PATTERN)]
      .map((match) => match[1])
      .filter((svg) => !fs.existsSync(path.join('examples', svg)));

    expect(missing).toEqual([]);
  });
});

interface ActionManifest {
  inputs: Record<string, { description: string; default?: string }>;
}

const manifest = yaml.load(read('action.yml')) as ActionManifest;
const declaredOutputs = [
  ...read('action.yml').split('\noutputs:')[1].matchAll(OUTPUT_KEY_PATTERN),
].map((match) => match[1]);

describe('action.yml is documented', () => {
  it('declares outputs this test can read', () => {
    expect(declaredOutputs.length).toBeGreaterThan(0);
  });

  it('names every declared output on each surface that lists outputs', () => {
    const undocumented = OUTPUT_SURFACES.flatMap((surface) => {
      const text = read(surface);

      return declaredOutputs
        .filter((output) => !text.includes(`\`${output}\``))
        .map((output) => `${surface} -> ${output}`);
    });

    expect(undocumented).toEqual([]);
  });

  it('documents every input in the wiki', () => {
    const configuration = read('docs/wiki/Configuration.md');
    const reference = read('docs/wiki/API-Reference.md');
    const undocumented = Object.keys(manifest.inputs).filter(
      (input) => !configuration.includes(`\`${input}\``) && !reference.includes(`\`${input}\``),
    );

    expect(undocumented).toEqual([]);
  });
});
