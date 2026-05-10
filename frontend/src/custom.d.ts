// custom.d.ts or styled-jsx.d.ts
    import 'react';

    declare module 'react' {
      interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
        jsx?: boolean;
        global?: boolean;
      }
    }

interface ImportMetaEnv {
  readonly DISABLE_BACKEND_PREFIX?: string;
  readonly IMAGE_URL_PREFIX?: string;
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
