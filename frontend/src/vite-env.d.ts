/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_0G_KV?: string;
  readonly VITE_0G_LOG?: string;
  readonly VITE_0G_BLOB?: string;
  readonly VITE_0G_COMPUTE?: string;
  readonly VITE_OG_EXPLORER?: string;
  readonly VITE_OG_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
