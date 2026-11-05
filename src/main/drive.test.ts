import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectDomainErrorAsync } from '../test/helpers';
import { accessToken, accountEmail, authorize, DRIVE_FOLDER, DriveAuthError, uploadBackup } from './drive';

const client = { id: 'client-id', secret: 'client-secret' };
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// The tests play the browser with the real fetch while the app's fetch talks to the fake Google.
const realFetch = globalThis.fetch;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content?: Buffer;
}

/** Just enough of Google's OAuth and Drive endpoints to run the client against. */
function fakeGoogle() {
  const files: DriveFile[] = [];
  const sessions = new Map<string, { name: string; parents: string[] }>();
  /** Authorization codes Google handed out, and the PKCE challenge each was issued for. */
  const challenges = new Map<string, string>();
  let next = 0;
  let uploadsFail = false;
  const json = (body: unknown, status = 200) => Response.json(body, { status });

  async function handle(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init.method ?? 'GET';
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init.body));
      if (form.get('client_id') !== client.id || form.get('client_secret') !== client.secret) return json({ error: 'invalid_client' }, 401);
      if (form.get('grant_type') === 'refresh_token') {
        return form.get('refresh_token') === 'refresh-1' ? json({ access_token: 'access-1', expires_in: 3599 }) : json({ error: 'invalid_grant' }, 400);
      }
      const challenge = challenges.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      if (!challenge || createHash('sha256').update(verifier).digest('base64url') !== challenge) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'access-1', refresh_token: 'refresh-1' });
    }
    if (new Headers(init.headers).get('Authorization') !== 'Bearer access-1') return json({ error: 'unauthenticated' }, 401);
    if (url.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'local@gmail.com' } });
    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const found = parent
        ? files.filter((file) => file.parents.includes(parent))
        : files.filter((file) => file.mimeType === FOLDER_MIME && q.includes(`name = '${file.name}'`));
      return json({ files: found.map(({ id, name }) => ({ id, name })) });
    }
    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(init.body)) as { name: string; mimeType: string };
      const folder = { id: `id-${++next}`, name: meta.name, mimeType: meta.mimeType, parents: [] };
      files.push(folder);
      return json({ id: folder.id });
    }
    if (url.pathname.startsWith('/drive/v3/files/') && method === 'DELETE') {
      files.splice(
        files.findIndex((file) => file.id === url.pathname.split('/').pop()),
        1,
      );
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/upload/drive/v3/files' && method === 'POST' && url.searchParams.get('uploadType') === 'resumable') {
      const session = `session-${++next}`;
      sessions.set(session, JSON.parse(String(init.body)) as { name: string; parents: string[] });
      return new Response(null, { headers: { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${session}` } });
    }
    const session = sessions.get(url.searchParams.get('upload_id') ?? '');
    if (url.pathname === '/upload/drive/v3/files' && method === 'PUT' && session) {
      if (uploadsFail) return json({ error: 'backendError' }, 503);
      const file = { id: `id-${++next}`, name: session.name, mimeType: 'application/octet-stream', parents: session.parents };
      files.push({ ...file, content: Buffer.from(init.body as Uint8Array) });
      return json({ id: file.id });
    }
    return json({ error: 'notFound' }, 404);
  }

  return {
    files,
    challenges,
    handle,
    failUploads() {
      uploadsFail = true;
    },
  };
}

const backupName = (hour: number) => `lebloc-2026-10-05T${String(hour).padStart(2, '0')}-00-00-000Z.db`;

describe('Google Drive', () => {
  let google: ReturnType<typeof fakeGoogle>;
  let dir: string;

  beforeEach(async () => {
    google = fakeGoogle();
    vi.stubGlobal('fetch', google.handle);
    dir = await mkdtemp(join(tmpdir(), 'lebloc-drive-'));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  async function localBackup(hour: number): Promise<string> {
    const file = join(dir, backupName(hour));
    await writeFile(file, `backup ${hour}`);
    return file;
  }

  describe('authorize', () => {
    it('trades the code for a refresh token with PKCE, ignores a forged callback and then stops listening', async () => {
      let redirect = '';
      const statuses: number[] = [];
      const browser = async (authUrl: string) => {
        const params = new URL(authUrl).searchParams;
        expect(params.get('client_id')).toBe(client.id);
        expect(params.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
        expect(params.get('access_type')).toBe('offline');
        redirect = params.get('redirect_uri') ?? '';
        expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        google.challenges.set('code-1', params.get('code_challenge') ?? '');
        statuses.push((await realFetch(`${redirect}/favicon.ico`)).status);
        statuses.push((await realFetch(`${redirect}/?code=stolen&state=forged`)).status);
        statuses.push((await realFetch(`${redirect}/?code=code-1&state=${params.get('state')}`)).status);
      };

      expect(await authorize(client, browser)).toBe('refresh-1');
      expect(statuses).toEqual([404, 400, 200]);
      await expect(realFetch(redirect)).rejects.toThrow();
    });

    it('fails when the user denies access in the browser', async () => {
      const denying = async (authUrl: string) => {
        const params = new URL(authUrl).searchParams;
        await realFetch(`${params.get('redirect_uri')}/?error=access_denied&state=${params.get('state')}`);
      };
      await expectDomainErrorAsync(() => authorize(client, denying), 'DRIVE_CONNECT_FAILED');
    });

    it('gives up when the browser never comes back', async () => {
      await expectDomainErrorAsync(() => authorize(client, async () => undefined, 20), 'DRIVE_CONNECT_FAILED');
    });
  });

  it('gets an access token and the account email from the refresh token', async () => {
    const token = await accessToken(client, 'refresh-1');
    expect(token).toBe('access-1');
    expect(await accountEmail(token)).toBe('local@gmail.com');
  });

  it('tells a revoked refresh token apart, since only reconnecting fixes it', async () => {
    await expect(accessToken(client, 'revoked')).rejects.toBeInstanceOf(DriveAuthError);
    await expect(accessToken({ ...client, secret: 'wrong' }, 'refresh-1')).rejects.not.toBeInstanceOf(DriveAuthError);
  });

  it('uploads each backup into a Lebloc folder of its own, created the first time', async () => {
    await uploadBackup('access-1', await localBackup(9));
    await uploadBackup('access-1', await localBackup(18));

    const folders = google.files.filter((file) => file.mimeType === FOLDER_MIME);
    expect(folders.map((folder) => folder.name)).toEqual([DRIVE_FOLDER]);
    const backups = google.files.filter((file) => file.parents.includes(folders[0]?.id ?? ''));
    expect(backups.map((file) => file.name)).toEqual([backupName(9), backupName(18)]);
    expect(backups[1]?.content).toEqual(await readFile(join(dir, backupName(18))));
  });

  it('keeps in Drive the same backups the local folder keeps', async () => {
    google.files.push({ id: 'folder', name: DRIVE_FOLDER, mimeType: FOLDER_MIME, parents: [] });
    for (let hour = 0; hour <= 10; hour++) google.files.push({ id: `old-${hour}`, name: backupName(hour), mimeType: 'x', parents: ['folder'] });

    await uploadBackup('access-1', await localBackup(12));

    const names = google.files.filter((file) => file.parents.includes('folder')).map((file) => file.name);
    expect(names).toHaveLength(10);
    expect(names).not.toContain(backupName(0));
    expect(names).not.toContain(backupName(1));
    expect(names).toContain(backupName(12));
  });

  it('leaves no backup behind when the upload fails', async () => {
    google.failUploads();
    await expect(uploadBackup('access-1', await localBackup(9))).rejects.toThrow();
    expect(google.files.filter((file) => file.mimeType !== FOLDER_MIME)).toEqual([]);
  });
});
