/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGORA_APP_ID?: string;
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID?: string;
  readonly VITE_WEB_APP_URL?: string;
  readonly VITE_ADMIN_APP_URL?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
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
  standalone?: boolean;
}

interface Window {
  webkitAudioContext?: typeof AudioContext;
  BeforeInstallPromptEvent?: Event;
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            error?: string;
            error_description?: string;
          }) => void;
        }) => { requestAccessToken: (options?: { prompt?: string }) => void };
      };
    };
  };
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly [key: string]: string | undefined;
  }
}
