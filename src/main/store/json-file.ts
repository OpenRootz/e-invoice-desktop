import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';

/** Upgrades the data of version `n` to version `n + 1`. */
export type Migration = (data: unknown) => unknown;

export interface JsonFileOptions<T> {
  schema: z.ZodType<T>;
  /** Current schema version written to the file */
  version: number;
  /** `migrations[n]` upgrades version `n` to `n + 1` */
  migrations?: Record<number, Migration>;
  /** Value when the file does not exist (or was unreadable) */
  fallback: () => T;
  /** Called when an unreadable file was moved aside */
  onRecovered?: (message: string) => void;
}

interface Envelope {
  schemaVersion: number;
  data: unknown;
}

/** The file was written by a newer version of the app; it is never overwritten. */
export class NewerFileVersionError extends Error {}

/**
 * One JSON file with a versioned envelope `{ schemaVersion, data }`.
 * - Reads validate the data and run migrations; an unreadable file is moved aside as `*.corrupt-<time>.json` and the
 *   fallback is used, so the app stays usable and nothing is lost.
 * - Writes are atomic (temp file, fsync, rename) and serialized per file.
 */
export class JsonFile<T> {
  private cache: T | undefined;
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly filePath: string,
    private readonly options: JsonFileOptions<T>,
  ) {}

  async read(): Promise<T> {
    if (!this.loaded) {
      this.cache = await this.load();
      this.loaded = true;
    }
    return structuredClone(this.cache as T);
  }

  async write(value: T): Promise<T> {
    const data = this.options.schema.parse(value);
    const run = this.queue.then(async () => {
      await writeAtomic(this.filePath, JSON.stringify({ schemaVersion: this.options.version, data } satisfies Envelope, null, 2) + '\n');
      this.cache = data;
      this.loaded = true;
    });
    this.queue = run.catch(() => undefined);
    await run;
    return structuredClone(data);
  }

  /** Read, change and write as one step, serialized with other writes of this file. */
  async update(change: (current: T) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const next = this.options.schema.parse(change(await this.read()));
      await writeAtomic(
        this.filePath,
        JSON.stringify({ schemaVersion: this.options.version, data: next } satisfies Envelope, null, 2) + '\n',
      );
      this.cache = next;
      return structuredClone(next);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<T> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return this.options.fallback();
      throw e;
    }
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
      if (typeof envelope !== 'object' || envelope === null || !Number.isInteger(envelope.schemaVersion)) {
        throw new Error('missing schemaVersion');
      }
    } catch (e) {
      return this.recover(`not valid JSON (${(e as Error).message})`);
    }
    if (envelope.schemaVersion > this.options.version) {
      throw new NewerFileVersionError(
        `${path.basename(this.filePath)} was written by a newer version of the app (schema ${envelope.schemaVersion}); please update the app`,
      );
    }
    let data = envelope.data;
    for (let v = envelope.schemaVersion; v < this.options.version; v++) {
      const migrate = this.options.migrations?.[v];
      if (!migrate) return this.recover(`no migration from schema version ${v}`);
      data = migrate(data);
    }
    const parsed = this.options.schema.safeParse(data);
    if (!parsed.success) return this.recover(`invalid data (${parsed.error.issues[0]?.message ?? 'unknown error'})`);
    return parsed.data;
  }

  private async recover(reason: string): Promise<T> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const aside = this.filePath.replace(/\.json$/, '') + `.corrupt-${stamp}.json`;
    await fs.rename(this.filePath, aside);
    this.options.onRecovered?.(`${path.basename(this.filePath)}: ${reason}; moved to ${path.basename(aside)}`);
    return this.options.fallback();
  }
}

/** Writes a file so that it is either completely old or completely new, even if the app or the machine stops. */
export async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
