interface ImportMetaEnv {
  readonly DISABLE_BACKEND_PREFIX?: string;
  readonly IMAGE_URL_PREFIX?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_USE_LEGACY_VALIDATOR_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
