export const RECAPTCHA_ENABLED =
  process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED === 'true';

export async function verifyRecaptchaToken(token) {
  if (!RECAPTCHA_ENABLED) return true; // bypass when disabled
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/verify-recaptcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    return data?.success === true;
  } catch (error) {
    console.error('reCAPTCHA verify error:', error);
    return false;
  }
}

