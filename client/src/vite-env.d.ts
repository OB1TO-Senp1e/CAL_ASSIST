/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only: render the app with a mock user so UI can be reviewed without a running API. */
  readonly VITE_AUTH_BYPASS?: string;
  /** `1` enables mock data for all screen groups during offline previews. */
  readonly VITE_USE_MOCK?: string;
  /** `1` uses mock authentication during offline previews; auth is live by default in Stage 3. */
  readonly VITE_AUTH_USE_MOCK?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
