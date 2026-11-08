import { AwsClient } from 'aws4fetch';
import { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } from 'astro:env/server';

/**
 * Guests' photos and videos go straight from the browser to R2 with a presigned PUT, so nothing
 * passes through a Netlify Function (they cap request bodies at about 6 MB). R2 takes up to 5 GB
 * in one PUT.
 */

/** Characters allowed in object keys. Keeping to these means a key never needs URI-encoding. */
export function keySafe(text: string, maxLength = 80) {
	return text
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/&/g, 'and')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^[-.]+|-+$/g, '')
		.slice(0, maxLength);
}

let client: AwsClient | undefined;
function r2() {
	if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
		throw new Error('R2 credentials are not configured');
	}
	client ??= new AwsClient({
		accessKeyId: R2_ACCESS_KEY_ID,
		secretAccessKey: R2_SECRET_ACCESS_KEY,
		service: 's3',
		region: 'auto',
	});
	return { client, base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/` };
}

/**
 * A URL the browser can PUT the file to for the next hour, and the headers it must send. The type
 * and size are signed, so R2 turns down anything other than what the server approved. The browser
 * sets Content-Length itself, so it isn't in the returned headers.
 */
export async function presignPut(key: string, contentType: string, size: number) {
	const { client, base } = r2();
	const url = new URL(key, base);
	url.searchParams.set('X-Amz-Expires', String(60 * 60));
	const signed = await client.sign(url, {
		method: 'PUT',
		headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
		aws: { signQuery: true, allHeaders: true },
	});
	return { url: signed.url, headers: { 'Content-Type': contentType } };
}
