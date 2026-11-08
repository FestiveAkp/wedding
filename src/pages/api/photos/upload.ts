import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { joinNames } from '@/lib/guests';
import { keySafe, presignPut } from '@/lib/r2';
import { identifyVisitor } from '@/lib/visitor';

export const prerender = false;

/** Some phones and browsers give HEIC and RAW files no type, so the extension decides for them */
const MEDIA_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|avif|dng|tiff?|mov|mp4|m4v|3gp|webm|avi|mkv)$/i;

/** Bigger than any phone video guests are likely to have, well under R2's 5 GB for one PUT */
const MAX_BYTES = 2 * 1024 ** 3;

const json = (body: object, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Hands a verified guest a presigned URL to PUT one file to R2. Posts `{ name, type, size }` and gets
 * `{ url, headers, key }`. Files are filed under the guest's household, e.g.
 * `uploads/H12-Priya-and-Raj-Sharma/2027-06-27_14-03-11_ab12cd_IMG_1234.HEIC`, and every file
 * gets a new key, so guests can't overwrite anything.
 */
export const POST: APIRoute = async ({ request, url, cookies }) => {
	const visitor = await identifyVisitor(url, cookies);
	if (!visitor.verified) return json({ error: 'Please reload the page and sign in again.' }, 401);
	const { household } = visitor;
	const folder = `uploads/${keySafe(`${household.id}-${joinNames(household.guests)}`)}/`;

	const body: Record<string, unknown> | null = await request.json().catch(() => null);
	if (!body) return json({ error: 'Bad request' }, 400);
	const name = typeof body.name === 'string' ? body.name : '';
	const type = typeof body.type === 'string' ? body.type : '';
	const size = typeof body.size === 'number' && Number.isSafeInteger(body.size) && body.size >= 0 ? body.size : null;
	// A file without a media type is let through on its extension, but stored as plain bytes
	const contentType = /^(image|video)\//.test(type)
		? type
		: MEDIA_EXTENSIONS.test(name)
			? 'application/octet-stream'
			: null;
	if (!contentType) return json({ error: 'Only photos and videos can be uploaded.' }, 415);
	if (size === null) return json({ error: 'Bad request' }, 400);
	if (size > MAX_BYTES) return json({ error: 'This file is too big to upload here (over 2 GB).' }, 413);

	const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
	const key = `${folder}${stamp}_${randomBytes(3).toString('hex')}_${keySafe(name, 120) || 'file'}`;
	try {
		const signed = await presignPut(key, contentType, size);
		console.log(`[upload] start ${key}`);
		return json({ ...signed, key });
	} catch (e) {
		console.error('Signing upload failed', e);
		return json({ error: 'Something went wrong on our end. Please try again in a few minutes.' }, 500);
	}
};
