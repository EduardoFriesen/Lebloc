import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename } from 'node:path';
import { z } from 'zod';
import { DomainError } from '../domain/errors';
import { BACKUP_DAYS_TO_KEEP, BACKUP_FILE, BACKUPS_TO_KEEP, backupsToKeep } from './backup';

export const DRIVE_FOLDER = 'Lebloc backups';
// Only the files the app itself created: it never sees the rest of the account's Drive.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Long enough to type the password and the second step of the Google sign-in.
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const DONE_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Lebloc</title><p style="font-family:sans-serif">Listo. Podés cerrar esta pestaña y volver a Lebloc.</p>';

/** The OAuth client of Lebloc's Google Cloud project, of the "App de escritorio" kind. */
export interface GoogleClient {
  id: string;
  secret: string;
}

/** Google no longer takes the refresh token (revoked, or expired): only connecting the account again fixes it. */
export class DriveAuthError extends Error {
  constructor() {
    super('Google Drive access was revoked or expired');
    this.name = 'DriveAuthError';
  }
}

const filesSchema = z.object({ files: z.array(z.object({ id: z.string(), name: z.string() })) });

type Auth = Record<string, string>;
const bearer = (token: string): Auth => ({ Authorization: `Bearer ${token}` });

async function google(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Google answered ${response.status} to ${init.method ?? 'GET'} ${url.split('?')[0]}: ${await response.text()}`);
  return response;
}

/**
 * Google's sign-in for desktop apps: the browser signs in and sends the code back to a one-off server on this PC.
 * PKCE ties the code to this run and `state` to this request, so no other page or app can use it. Returns the
 * refresh token, which lets the app upload without signing in again.
 */
export async function authorize(client: GoogleClient, openBrowser: (url: string) => Promise<void>, timeoutMs = LOGIN_TIMEOUT_MS): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(16).toString('base64url');
  let settle: (params: URLSearchParams | null) => void = () => undefined;
  const callback = new Promise<URLSearchParams | null>((resolve) => {
    settle = resolve;
  });
  const server = createServer((request, response) => {
    const params = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams;
    // The browser also asks for a favicon, and a hostile page could guess the port: neither ends the sign-in.
    if (!params.has('state')) return void response.writeHead(404, { Connection: 'close' }).end();
    if (params.get('state') !== state) return void response.writeHead(400, { Connection: 'close' }).end();
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }).end(DONE_PAGE);
    settle(params);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const timer = setTimeout(() => settle(null), timeoutMs);
  try {
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await openBrowser(
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: client.id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
      })}`,
    );
    // No code: the user denied access, closed the tab or never came back.
    const code = (await callback)?.get('code');
    if (!code) throw new DomainError('DRIVE_CONNECT_FAILED');
    const response = await google(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: client.id,
        client_secret: client.secret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    return z.object({ refresh_token: z.string() }).parse(await response.json()).refresh_token;
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

/** A fresh access token for each upload: there are two a day, so caching it is not worth it. */
export async function accessToken(client: GoogleClient, refreshToken: string): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return z.object({ access_token: z.string() }).parse(body).access_token;
  if (z.object({ error: z.literal('invalid_grant') }).safeParse(body).success) throw new DriveAuthError();
  throw new Error(`Google answered ${response.status} to the token refresh`);
}

export async function accountEmail(token: string): Promise<string> {
  const response = await google('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: bearer(token) });
  return z.object({ user: z.object({ emailAddress: z.string() }) }).parse(await response.json()).user.emailAddress;
}

/** Best effort: disconnecting has to work offline too, and the app forgets the token either way. */
export async function revoke(refreshToken: string): Promise<void> {
  await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: refreshToken }) }).catch(() => undefined);
}

async function listFiles(auth: Auth, q: string) {
  const response = await google(`${FILES_URL}?${new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1000' })}`, { headers: auth });
  return filesSchema.parse(await response.json()).files;
}

async function findOrCreateFolder(auth: Auth): Promise<string> {
  const [found] = await listFiles(auth, `name = '${DRIVE_FOLDER}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  if (found) return found.id;
  const created = await google(FILES_URL, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: FOLDER_MIME }),
  });
  return z.object({ id: z.string() }).parse(await created.json()).id;
}

/**
 * Uploads a backup into the app's folder in Drive and prunes it like the local folder. The resumable upload only
 * creates the file once every byte arrived, so a cut connection never leaves half a backup there.
 */
export async function uploadBackup(token: string, file: string): Promise<void> {
  const auth = bearer(token);
  const folder = await findOrCreateFolder(auth);
  const session = await google('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: basename(file), parents: [folder] }),
  });
  const location = session.headers.get('Location');
  if (!location) throw new Error('Google did not return an upload session');
  await google(location, { method: 'PUT', headers: auth, body: await readFile(file) });

  const backups = (await listFiles(auth, `'${folder}' in parents and trashed = false`)).filter((backup) => BACKUP_FILE.test(backup.name));
  const kept = backupsToKeep(
    backups.map((backup) => backup.name),
    BACKUPS_TO_KEEP,
    BACKUP_DAYS_TO_KEEP,
  );
  await Promise.all(backups.filter((backup) => !kept.has(backup.name)).map((backup) => google(`${FILES_URL}/${backup.id}`, { method: 'DELETE', headers: auth })));
}
