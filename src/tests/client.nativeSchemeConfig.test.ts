import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('native OAuth callback registration', () => {
  it('registers rizzoma://auth-callback on Android and iOS', () => {
    const android = readFileSync(join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const ios = readFileSync(join(process.cwd(), 'ios/App/App/Info.plist'), 'utf8');
    expect(android).toContain('android.intent.action.VIEW');
    expect(android).toContain('android.intent.category.BROWSABLE');
    expect(android).toContain('android:scheme="rizzoma"');
    expect(android).toContain('android:host="auth-callback"');
    expect(ios).toContain('<key>CFBundleURLSchemes</key>');
    expect(ios).toContain('<string>rizzoma</string>');
  });
});
