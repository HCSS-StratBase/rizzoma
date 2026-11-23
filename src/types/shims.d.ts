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

// KaTeX stylesheet, loaded on demand by src/client/lib/katexRender.ts
declare module 'katex/dist/katex.min.css';
