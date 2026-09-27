/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: render the app with a mock user so UI can be reviewed without a running API. */
  readonly VITE_AUTH_BYPASS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
