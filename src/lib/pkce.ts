import { exchangeCode } from './api';

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const callbackUrl = () => location.origin + location.pathname;

export async function startLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('orc-pkce', verifier);
  const q = new URLSearchParams({
    callback_url: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    key_label: 'OpenRouter Client',
  });
  location.href = `https://openrouter.ai/auth?${q}`;
}

export async function completeLogin(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return null;
  const verifier = sessionStorage.getItem('orc-pkce');
  history.replaceState(null, '', callbackUrl() + location.hash);
  if (!verifier) throw new Error('Sign-in session expired. Please try again.');
  sessionStorage.removeItem('orc-pkce');
  return exchangeCode(code, verifier);
}
