// ──────────────────────────────────────────────────────────────
// Auth0 Verifier — validates the callback parameters from Auth0
//
// These are called inside the callback handler before token exchange.
// Failing early prevents unnecessary server-to-server calls.
// ──────────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true }
  | { ok: false; message: string }

/**
 * Verify that the Authorization Code callback has the required parameters.
 */
export function verifyCallbackParams(
  code: string | null,
  state: string | null,
  error: string | null,
): VerifyResult {
  // Auth0 sends 'error' param when the user denies access
  if (error) {
    return {
      ok: false,
      message: `Auth0 returned error: ${error}`,
    }
  }

  if (!code || code.trim().length === 0) {
    return { ok: false, message: 'Missing authorization code' }
  }

  if (!state || state.trim().length === 0) {
    return { ok: false, message: 'Missing state parameter' }
  }

  // Auth0 codes are short Base64URL strings — basic sanity check
  if (!/^[A-Za-z0-9\-_]+$/.test(code)) {
    return { ok: false, message: 'Invalid authorization code format' }
  }

  return { ok: true }
}

/**
 * Verify that Auth0 user info has the required fields.
 * (Some social providers may omit optional fields.)
 */
export function verifyUserInfo(
  userInfo: Record<string, unknown>,
): VerifyResult {
  if (!userInfo.sub || typeof userInfo.sub !== 'string') {
    return { ok: false, message: 'Auth0 user info missing sub (unique ID)' }
  }

  if (!userInfo.email || typeof userInfo.email !== 'string') {
    return { ok: false, message: 'Auth0 user info missing email' }
  }

  // Email must look like an email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInfo.email as string)) {
    return { ok: false, message: 'Auth0 returned invalid email format' }
  }

  return { ok: true }
}
