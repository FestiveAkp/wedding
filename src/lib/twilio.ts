import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } from 'astro:env/server';

// Twilio Verify generates the code, expires it after 10 minutes, and rate-limits sends and checks per number.
// Every guest gets a text. Indian numbers go over the international route, which doesn't need DLT registration.
function verifyRequest(path: string, params: Record<string, string>) {
	return fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/${path}`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams(params),
	});
}

/** Logs a Verify event with only the country code and last four digits, so logs don't hold guests' full numbers */
function log(event: string, phone: string, details: Record<string, unknown> = {}) {
	const masked = `+${phone.slice(0, -10) || '?'}…${phone.slice(-4)}`;
	console.log(`[verify] ${event} ${masked}`, JSON.stringify(details));
}

/** Sends a code to a full phone number (digits only). `tooMany` means Twilio's per-number limit was hit. */
export async function sendCode(phone: string): Promise<'sent' | 'tooMany'> {
	const res = await verifyRequest('Verifications', { To: `+${phone}`, Channel: 'sms' });
	if (res.status === 429) {
		log('send rate-limited', phone);
		return 'tooMany';
	}
	if (!res.ok) throw new Error(`Twilio send failed (${res.status}): ${await res.text()}`);
	const { sid, status, send_code_attempts } = await res.json();
	log('code sent', phone, { sid, status, attempts: send_code_attempts?.length });
	return 'sent';
}

/** `expired` covers a code that timed out, was already used, or had too many wrong guesses. */
export async function checkCode(phone: string, code: string): Promise<'approved' | 'wrong' | 'expired'> {
	const res = await verifyRequest('VerificationCheck', { To: `+${phone}`, Code: code });
	if (res.status === 404 || res.status === 429) {
		log('check expired', phone, { status: res.status });
		return 'expired';
	}
	if (!res.ok) throw new Error(`Twilio check failed (${res.status}): ${await res.text()}`);
	const { sid, status } = await res.json();
	const result = status === 'approved' ? 'approved' : 'wrong';
	log(`check ${result}`, phone, { sid });
	return result;
}
