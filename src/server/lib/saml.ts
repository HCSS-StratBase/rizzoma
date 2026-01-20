/**
 * SAML 2.0 authentication service
 * Uses @node-saml/node-saml for XML signature validation and SAML protocol handling
 */

import { SAML, type SamlConfig } from '@node-saml/node-saml';

// SAML environment variables
const SAML_ENABLED = process.env['SAML_ENABLED'] === 'true';
const SAML_ENTRY_POINT = process.env['SAML_ENTRY_POINT'];
const SAML_ISSUER = process.env['SAML_ISSUER'];
const SAML_CERT = process.env['SAML_CERT'];
const SAML_EMAIL_ATTR = process.env['SAML_EMAIL_ATTR'] || 'email';
const SAML_NAME_ATTR = process.env['SAML_NAME_ATTR'] || 'displayName';

// Lazy-initialized SAML instance
let samlInstance: SAML | null = null;

/**
 * Check if SAML is properly configured
 */
export function isSamlEnabled(): boolean {
  return SAML_ENABLED && !!SAML_ENTRY_POINT && !!SAML_ISSUER && !!SAML_CERT;
}

/**
 * Get SAML configuration from environment variables
 */
export function getSamlConfig(callbackUrl: string): SamlConfig {
  if (!isSamlEnabled()) {
    throw new Error('SAML is not configured');
  }

  // Parse certificate - handle newline escaping from env vars
  const idpCert = SAML_CERT!.replace(/\\n/g, '\n');

  return {
    entryPoint: SAML_ENTRY_POINT!,
    issuer: SAML_ISSUER!,
    idpCert,
    callbackUrl,
    // Common defaults
    signatureAlgorithm: 'sha256',
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  };
}

/**
 * Get or create SAML instance (lazy initialization)
 */
export function getSamlInstance(callbackUrl: string): SAML {
  if (!samlInstance) {
    const config = getSamlConfig(callbackUrl);
    samlInstance = new SAML(config);
  }
  return samlInstance;
}

/**
 * Extract email and name from SAML profile using configured attribute names
 */
export function extractUserFromProfile(profile: Record<string, unknown>): { email: string; name?: string } | null {
  // Try configured email attribute, then common alternatives
  const emailCandidates = [
    SAML_EMAIL_ATTR,
    'email',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    'nameID',
  ];

  let email: string | undefined;
  for (const attr of emailCandidates) {
    const value = profile[attr];
    if (typeof value === 'string' && value.includes('@')) {
      email = value;
      break;
    }
  }

  if (!email) {
    return null;
  }

  // Try configured name attribute, then common alternatives
  const nameCandidates = [
    SAML_NAME_ATTR,
    'displayName',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    'givenName',
    'name',
  ];

  let name: string | undefined;
  for (const attr of nameCandidates) {
    const value = profile[attr];
    if (typeof value === 'string' && value.length > 0) {
      name = value;
      break;
    }
  }

  return { email: email.toLowerCase(), name };
}

/**
 * Generate SP metadata XML for IdP configuration
 */
export function generateMetadata(callbackUrl: string, issuer: string): string {
  // Basic SP metadata - most IdPs can use this for configuration
  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(issuer)}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escapeXml(callbackUrl)}" index="0"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
