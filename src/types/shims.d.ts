declare module 'date-utils';

interface Date {
  toFormat(fmt: string): string;
  toYMD(): string;
}

