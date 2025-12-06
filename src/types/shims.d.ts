declare module 'date-utils';

interface Date {
  toFormat(fmt: string): string;
  toYMD(): string;
}

interface ImportMetaEnv {
  [key: string]: string | undefined;
}

interface ImportMeta {
  env: ImportMetaEnv;
}
