# rizzoma_login.png

- What it shows: Rizzoma legacy login modal over a topic page, prompting for authentication to view/comment. Modal offers Gmail, Facebook, and direct email/password sign-in. Email is prefilled with `david.muchlinski@inta.gatech.edu`; password field obscured; primary call-to-action is "Sign in".
- UI details vs. modernized app: This is the legacy CoffeeScript-era auth dialog (modal overlay, blue CTA, social buttons). Our modern React flow should preserve the same entry points and copy while using the new auth plumbing. Ensure feature flags still surface this modal when unauthenticated users open a topic.
- Control list (top to bottom):
  - Gmail button (red bar with envelope icon, label "Sign In With Gmail").
  - Facebook button (blue bar with FB icon, label "Sign In With Facebook").
  - Email field (prefilled with david.muchlinski@inta.gatech.edu in screenshot).
  - Password field (obscured input).
  - Sign-in button (teal, label "Sign in").
  - Footer links: "Sign up" and "Forgot password?".
- Screen context: Modal sits atop a blurred/blocked topic page; sidebar and mind map toggle are visible but disabled behind the overlay.
- Gaps to mirror: Keep the modal trigger on unauthenticated topic access, preserve social providers and forgot-password links, and ensure the overlay blocks interaction until auth succeeds.
