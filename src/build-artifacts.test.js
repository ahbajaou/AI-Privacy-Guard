import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readTextFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTextFiles(path);
    if (entry.name.endsWith('.map') || /\.(png|jpe?g|ico)$/i.test(entry.name)) return [];
    return [readFileSync(path, 'utf8')];
  }).join('\n');
}

function containsSourceMap(directory) {
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? containsSourceMap(path)
      : entry.name.endsWith('.map');
  });
}

describe('release build separation', () => {
  it('excludes development diagnostics implementation from production artifacts', () => {
    const production = readTextFiles('build');
    const manifest = JSON.parse(readFileSync('build/manifest.json', 'utf8'));

    for (const diagnosticOnly of [
      'Copy diagnostics',
      'AIPG_GET_DIAGNOSTICS',
      'getDiagnostics',
      'diagnosticsBuildId',
      'directTextNodePaths',
      'candidateStructure',
      'diagnostics-panel',
    ]) {
      expect(production, `${diagnosticOnly} must not ship in production`).not.toContain(diagnosticOnly);
    }

    expect(manifest.version).toBe('1.3.0');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.content_scripts[0].js).toEqual(['platforms.js', 'content.js']);
    expect(containsSourceMap('build')).toBe(false);
  });

  it('keeps the development diagnostics endpoint and UI in the separate diagnostics build', () => {
    const diagnostics = readTextFiles('build-diagnostics');

    expect(diagnostics).toContain('Copy diagnostics');
    expect(diagnostics).toContain('AIPG_GET_DIAGNOSTICS');
    expect(diagnostics).toContain('getDiagnostics');
    expect(diagnostics).toContain('directTextNodePaths');
    expect(JSON.parse(readFileSync('build-diagnostics/manifest.json', 'utf8')).version).toBe('1.3.0');
  });
});
