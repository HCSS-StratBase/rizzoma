import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    userName?: string;
    userAvatar?: string;
    authVersion?: number;
    csrfToken?: string;
    twitterOAuthState?: string;
    twitterCodeVerifier?: string;
    oauthTransactions?: Record<string, {
      provider: 'google' | 'facebook' | 'microsoft' | 'twitter';
      state: string;
      createdAt: number;
      mobileChallenge?: string;
      codeVerifier?: string;
    }>;
  }
}
