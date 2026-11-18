import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const CORE = path.join(__dirname, '../../../src/core');

function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
}

describe('core layer boundary', () => {
  it('does not import Electron, React or app code', () => {
    const offenders = files(CORE).filter((f) =>
      /from ['"](electron|react|react-dom)['"/]|from ['"]\.\.\/(\.\.\/)*(main|preload|renderer|shared)\//.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
