import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    userName?: string;
    userAvatar?: string;
    csrfToken?: string;
    twitterOAuthState?: string;
    twitterCodeVerifier?: string;
  }
}
