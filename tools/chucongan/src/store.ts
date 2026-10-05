import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export class Store {
  constructor(readonly directory: string) {}

  path(key: string) {
    return resolve(
      this.directory,
      `${createHash('sha256').update(key).digest('hex')}.json`,
    );
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.path(key), 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async put(key: string, value: unknown) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.path(key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, destination);
  }

  async values<T>(): Promise<T[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const names = await readdir(this.directory);
    return Promise.all(
      names
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .map(
          async (name) =>
            JSON.parse(
              await readFile(resolve(this.directory, name), 'utf8'),
            ) as T,
        ),
    );
  }
}
