import { createSign } from 'node:crypto';
import { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } from 'astro:env/server';

let token: { value: string; expires: number } | undefined;

// Service account auth: sign a JWT with the account's private key and trade it for an access token.
async function accessToken() {
	if (token && token.expires > Date.now() + 60_000) return token.value;

	const now = Math.floor(Date.now() / 1000);
	const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
	const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
		iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
		scope: 'https://www.googleapis.com/auth/spreadsheets',
		aud: 'https://oauth2.googleapis.com/token',
		iat: now,
		exp: now + 3600,
	})}`;
	// Netlify env vars often store the key's newlines as literal "\n"
	const key = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
	const signature = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');

	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${unsigned}.${signature}`,
		}),
	});
	if (!res.ok) throw new Error(`Google auth failed (${res.status}): ${await res.text()}`);

	const data = await res.json();
	token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
	return token.value;
}

function rangeUrl(range: string) {
	return `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}`;
}

export async function getValues(range: string): Promise<string[][]> {
	const res = await fetch(rangeUrl(range), {
		headers: { Authorization: `Bearer ${await accessToken()}` },
	});
	if (!res.ok) throw new Error(`Sheets read failed (${res.status}): ${await res.text()}`);
	return (await res.json()).values ?? [];
}

export async function appendRow(range: string, row: (string | number)[]) {
	// RAW so guest-typed text is never interpreted as a formula
	const res = await fetch(`${rangeUrl(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${await accessToken()}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ values: [row] }),
	});
	if (!res.ok) throw new Error(`Sheets append failed (${res.status}): ${await res.text()}`);
}
