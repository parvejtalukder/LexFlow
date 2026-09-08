import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'reCAPTCHA token is missing.' }, { status: 400 });
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      console.error('Missing RECAPTCHA_SECRET_KEY');
      return NextResponse.json({ error: 'reCAPTCHA is not configured.' }, { status: 500 });
    }

    const params = new URLSearchParams({ secret, response: token });
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();

    if (data.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'reCAPTCHA verification failed. Please try again.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('reCAPTCHA verify error:', error);
    return NextResponse.json({ error: 'Failed to verify reCAPTCHA.' }, { status: 500 });
  }
}
