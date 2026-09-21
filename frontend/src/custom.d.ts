interface ImportMetaEnv {
  readonly DISABLE_BACKEND_PREFIX?: string;
  readonly IMAGE_URL_PREFIX?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_USE_LEGACY_VALIDATOR_PROFILE?: string;
  readonly VITE_TELEMETRY_ENDPOINT?: string;
  readonly VITE_WIDGET_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  DeepStakeWidget: {
    mount: () => void;
    unmount: (element: HTMLElement) => void;
    version: string;
  };
  MyWidget: {
    mountDeepStakeWidgets: () => void;
  };
}
