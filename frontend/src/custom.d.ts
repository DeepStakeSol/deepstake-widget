interface ImportMetaEnv {
  readonly DISABLE_BACKEND_PREFIX?: string;
  readonly IMAGE_URL_PREFIX?: string;
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
