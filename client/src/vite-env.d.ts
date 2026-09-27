/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: render the app with a mock user so UI can be reviewed without a running API. */
  readonly VITE_AUTH_BYPASS?: string;
  /** `0` disables the Stage 2 mock data layer and talks to the real backend (Stage 3+). */
  readonly VITE_USE_MOCK?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
