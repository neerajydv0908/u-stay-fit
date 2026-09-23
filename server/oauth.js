// All identity/token verification is server-side. The browser receives only our session cookie.
import { secretValue } from './config.js';
import { createHash, createHmac } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export function createOAuthClient({
  origin,
  env = process.env,
  fetchImpl = fetch,
  keys = googleKeys,
}) {
  const configured = (provider) =>
    Boolean(
      env[`${provider.toUpperCase()}_CLIENT_ID`] &&
      secretValue(`${provider.toUpperCase()}_CLIENT_SECRET`, env),
    );
  const version = env.FACEBOOK_API_VERSION || 'v23.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Facebook API version.');
  function authorization(provider, { state, verifier, nonce, reauth }) {
    const url = new URL(
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : `https://www.facebook.com/${version}/dialog/oauth`,
    );
    url.search = new URLSearchParams({
      client_id: env[`${provider.toUpperCase()}_CLIENT_ID`],
      redirect_uri: `${origin}/api/auth/${provider}/callback`,
      response_type: 'code',
      scope: provider === 'google' ? 'openid email profile' : 'email,public_profile',
      state,
    }).toString();
    if (provider === 'google') {
      url.searchParams.set(
        'code_challenge',
        createHash('sha256').update(verifier).digest('base64url'),
      );
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('nonce', nonce);
      if (reauth) {
        url.searchParams.set('max_age', '0');
        url.searchParams.set('prompt', 'select_account');
        url.searchParams.set(
          'claims',
          JSON.stringify({ id_token: { auth_time: { essential: true } } }),
        );
      }
    } else if (reauth) url.searchParams.set('auth_type', 'reauthenticate');
    return url.toString();
  }
  async function exchange(provider, code, attempt) {
    const key = provider.toUpperCase(),
      secret = secretValue(`${key}_CLIENT_SECRET`, env);
    const params = {
      client_id: env[`${key}_CLIENT_ID`],
      client_secret: secret,
      redirect_uri: `${origin}/api/auth/${provider}/callback`,
      code,
      grant_type: 'authorization_code',
    };
    if (provider === 'google') params.code_verifier = attempt.verifier;
    const response = await fetchImpl(
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : `https://graph.facebook.com/${version}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(12000),
      },
    );
    const tokens = await response.json();
    if (!response.ok || typeof tokens.access_token !== 'string')
      throw new Error('Token exchange failed');
    if (provider === 'google') {
      const { payload } = await jwtVerify(tokens.id_token, keys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: env.GOOGLE_CLIENT_ID,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
      });
      if (
        payload.nonce !== attempt.nonce ||
        payload.email_verified !== true ||
        typeof payload.email !== 'string' ||
        ((payload.azp || (Array.isArray(payload.aud) && payload.aud.length > 1)) &&
          payload.azp !== env.GOOGLE_CLIENT_ID)
      )
        throw new Error('Invalid identity claims');
      if (
        payload.at_hash &&
        payload.at_hash !==
          createHash('sha256')
            .update(tokens.access_token)
            .digest()
            .subarray(0, 16)
            .toString('base64url')
      )
        throw new Error('Access token mismatch');
      if (
        attempt.user_id &&
        (typeof payload.auth_time !== 'number' ||
          payload.auth_time < new Date(attempt.created_at).getTime() / 1000 - 60 ||
          payload.auth_time > Date.now() / 1000 + 60)
      )
        throw new Error('Fresh provider authentication is required');
      return { subject: payload.sub, email: payload.email.toLowerCase(), name: payload.name };
    }
    const url = new URL(`https://graph.facebook.com/${version}/me`);
    url.searchParams.set('fields', 'id,name,email');
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', secret).update(tokens.access_token).digest('hex'),
    );
    const infoResponse = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(12000),
    });
    const info = await infoResponse.json();
    if (!infoResponse.ok || typeof info.id !== 'string')
      throw new Error('Identity verification failed');
    return {
      subject: info.id,
      email: typeof info.email === 'string' ? info.email.toLowerCase() : null,
      name: info.name,
    };
  }
  return { configured, authorization, exchange };
}
