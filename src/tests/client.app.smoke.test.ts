import { describe, it, expect } from 'vitest';

describe('client: App smoke render', () => {
  it('renders App without throwing', async () => {
    // Minimal window/document stubs for SSR-style render
    (globalThis as any).window = {
      location: { hash: '#/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    };
    (globalThis as any).document = {
      getElementById: () => null,
    };

    const React = await import('react');
    const ReactDOMServer = await import('react-dom/server');
    const mainModule: any = await import('../client/main');
    const App = mainModule.App || mainModule.default;

    const html = (ReactDOMServer as any).renderToString(React.createElement(App));
    expect(typeof html).toBe('string');
    expect(html).toContain('Rizzoma (Modern)');
  });
});

