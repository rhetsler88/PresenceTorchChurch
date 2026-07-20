/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGORA_APP_ID?: string;
  readonly VITE_WEB_APP_URL?: string;
  readonly VITE_ADMIN_APP_URL?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Navigator {
  bluetooth?: {
    requestDevice(options?: unknown): Promise<unknown>;
    [key: string]: unknown;
  };
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly [key: string]: string | undefined;
  }
}
