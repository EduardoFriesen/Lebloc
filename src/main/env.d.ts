// Lebloc's Google OAuth client, baked into the build from `.env` (see docs/instalacion.md). A build without it has no Drive.
interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string;
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
