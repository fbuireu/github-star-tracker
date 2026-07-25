import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './defaults';

interface ActionInput {
  description: string;
  required?: boolean;
  default?: string;
}

interface ActionManifest {
  inputs: Record<string, ActionInput>;
  outputs: Record<string, { description: string }>;
}

const manifest = yaml.load(fs.readFileSync(path.resolve('action.yml'), 'utf8')) as ActionManifest;

const UPPERCASE_LETTER_PATTERN = /[A-Z]/g;

const OVERRIDABLE = Object.keys(DEFAULTS).filter((key) => key !== 'sendOnNoChanges');

function toKebabCase(key: string): string {
  return key.replaceAll(UPPERCASE_LETTER_PATTERN, (letter) => `-${letter.toLowerCase()}`);
}

describe('action.yml inputs', () => {
  it.each(OVERRIDABLE)('declares an input for the %s config key', (key) => {
    expect(manifest.inputs).toHaveProperty(toKebabCase(key));
  });

  it.each(OVERRIDABLE)('leaves the %s default empty so the config file can win', (key) => {
    expect(manifest.inputs[toKebabCase(key)].default ?? '').toBe('');
  });

  it('keeps a default only on inputs with no config file counterpart', () => {
    const overridableInputs = new Set(OVERRIDABLE.map(toKebabCase));
    const withDefaults = Object.entries(manifest.inputs)
      .filter(([, input]) => (input.default ?? '') !== '')
      .map(([name]) => name);

    expect(withDefaults.filter((name) => overridableInputs.has(name))).toEqual([]);
    expect(withDefaults.sort()).toEqual(['config-path', 'send-on-no-changes', 'smtp-port']);
  });
});
