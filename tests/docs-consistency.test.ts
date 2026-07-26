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
  'ARCHITECTURE.md',
  'docs/wiki/API-Reference.md',
  'docs/wiki/Viewing-Reports.md',
  'src/application/CLAUDE.md',
];

const MIN_EXPECTED_DOCS = 20;

const ADR_DIRECTORY = 'docs/adr';
const ADR_TEMPLATE = 'docs/adr/0000-adr-template.md';
const ADR_INDEX = 'ARCHITECTURE.md';
const ADR_SECTIONS = ['Status', 'Context', 'Decision', 'Consequences'];
const ADR_STATUSES = new Set(['Template', 'Proposed', 'Accepted', 'Superseded', 'Deprecated']);
const ADR_FILE_PATTERN = /^docs\/adr\/\d{4}(-[a-z\d]+)+\.md$/;
const ADR_STATUS_PATTERN = /\n## Status\n\n(\w+)/;
const ADR_DATE_PATTERN = /\nDate: \d{4}-\d{2}-\d{2}\n/;
const ADR_REFERENCE_PATTERNS = [/ADR (\d{4})/g, /docs\/adr\/(\d{4})-/g];

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
  ...['CLAUDE.md', 'ARCHITECTURE.md', 'CONTEXT.md', 'README.md', 'examples/README.md'].filter((doc) =>
    fs.existsSync(doc),
  ),
  ...walk('docs', isMarkdown),
  ...walk('src', (filename) => filename === 'CLAUDE.md'),
];

const isTestFile = (filename: string): boolean => filename.endsWith('.test.ts');

const TEST_FILENAMES = new Set(
  [...walk('src', isTestFile), ...walk('tests', isTestFile)].map((file) => path.basename(file)),
);

const toPosix = (file: string): string => file.split(path.sep).join('/');

const ADR_FILES = walk(ADR_DIRECTORY, isMarkdown).map(toPosix).sort();

const adrNumber = (file: string): string => path.basename(file).slice(0, 4);

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function adrReferencesIn(doc: string): string[] {
  const body = read(doc);

  return ADR_REFERENCE_PATTERNS.flatMap((pattern) =>
    [...body.matchAll(pattern)].map(([, number]) => number),
  );
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

describe('architecture decision records', () => {
  it('numbers files sequentially from the template, with no gaps or duplicates', () => {
    const numbers = ADR_FILES.map((file) => Number(adrNumber(file)));

    expect(numbers).toEqual(numbers.map((_, index) => index));
  });

  it('names every file NNNN-kebab-title.md', () => {
    expect(ADR_FILES.filter((file) => !ADR_FILE_PATTERN.test(file))).toEqual([]);
  });

  it('fills in the template: numbered heading, date, status, and the four sections', () => {
    const malformed = ADR_FILES.flatMap((file) => {
      const body = read(file);
      const number = Number(adrNumber(file));
      const status = body.match(ADR_STATUS_PATTERN)?.[1] ?? '';
      const heading = new RegExp(`^# ${number}\\. \\S`);

      return [
        ...(heading.test(body) ? [] : [`${file}: heading is not "# ${number}. Title"`]),
        ...(ADR_DATE_PATTERN.test(body) ? [] : [`${file}: no "Date: YYYY-MM-DD" line`]),
        ...(ADR_STATUSES.has(status) ? [] : [`${file}: status is "${status}"`]),
        ...ADR_SECTIONS.filter((section) => !body.includes(`\n## ${section}\n`)).map(
          (section) => `${file}: no "## ${section}" section`,
        ),
      ];
    });

    expect(malformed).toEqual([]);
  });

  it('references only ADRs that exist', () => {
    const existing = new Set(ADR_FILES.map(adrNumber));
    const dangling = DOCS.flatMap((doc) =>
      adrReferencesIn(doc)
        .filter((number) => !existing.has(number))
        .map((number) => `${doc} -> ADR ${number}`),
    );

    expect(dangling).toEqual([]);
  });

  it('indexes every decision in ARCHITECTURE.md', () => {
    const index = read(ADR_INDEX);
    const unindexed = ADR_FILES.filter((file) => file !== ADR_TEMPLATE && !index.includes(file));

    expect(unindexed).toEqual([]);
  });

  it('gives every ADR a home outside the index', () => {
    const contextual = DOCS.map(toPosix).filter(
      (doc) => doc !== ADR_INDEX && !doc.startsWith(`${ADR_DIRECTORY}/`),
    );
    const linked = new Set(contextual.flatMap(adrReferencesIn));
    const orphaned = ADR_FILES.map(adrNumber).filter((number) => !linked.has(number));

    expect(orphaned).toEqual([]);
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
