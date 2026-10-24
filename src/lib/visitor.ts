import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { SESSION_SECRET } from 'astro:env/server';
import { findHousehold, type Household } from './guests';
import { phoneCandidates } from './phone';

const COOKIE = 'guest';
/** Signed proof the guest entered a code sent to their number */
const VERIFIED_COOKIE = 'verified';
/** The number a code was just sent to, so a refresh still shows the code box */
const CODE_SENT_COOKIE = 'code-sent';

const cookieOptions = {
	path: '/',
	httpOnly: true,
	secure: import.meta.env.PROD,
	sameSite: 'lax',
	maxAge: 400 * 24 * 60 * 60,
} as const;

/** A guest who has confirmed their number with a code */
interface VerifiedVisitor {
	household: Household;
	/** Full phone number that matched, digits only */
	phone: string;
	verified: true;
	invited?: undefined;
	invalid?: undefined;
	unavailable?: undefined;
}

/**
 * Someone who has entered a number but not confirmed it with a code. The household stays
 * hidden until they do, and the page must look the same whether or not the number is on the
 * guest list, so nobody can find out who's invited by typing in numbers.
 */
interface PendingVisitor {
	household?: undefined;
	/** Full phone number if it's on the guest list, otherwise the digits that were entered */
	phone: string;
	verified: false;
	/** The number is on the guest list, so codes are really sent. Never show this. */
	invited: boolean;
	invalid?: undefined;
	unavailable?: undefined;
}

interface AnonymousVisitor {
	household?: undefined;
	phone?: undefined;
	verified?: undefined;
	invited?: undefined;
	/** What was entered can't be a phone number */
	invalid?: boolean;
	/** The guest list couldn't be loaded */
	unavailable?: boolean;
}

/** Checking `verified` narrows to a confirmed guest, and `phone` to anyone who entered a number */
export type Visitor = VerifiedVisitor | PendingVisitor | AnonymousVisitor;

/**
 * Identifies the guest from the number they just `entered` in the phone form or, failing
 * that, the cookie set on an earlier visit. `?switch` forgets the remembered number.
 * Nothing about the household is revealed until the number is `verified`.
 */
export async function identifyVisitor(url: URL, cookies: AstroCookies, entered?: string): Promise<Visitor> {
	if (url.searchParams.has('switch')) {
		for (const name of [COOKIE, VERIFIED_COOKIE, CODE_SENT_COOKIE]) cookies.delete(name, { path: '/' });
		return {};
	}

	entered = entered?.trim().slice(0, 32);
	const remembered = cookies.get(COOKIE)?.value;
	const input = entered || remembered;
	if (!input) return {};
	if (phoneCandidates(input).length === 0) {
		if (!entered) cookies.delete(COOKIE, { path: '/' });
		return { invalid: Boolean(entered) };
	}

	try {
		const match = await findHousehold(input);
		// Remember a number that isn't on the list too, exactly as if it were
		const phone = match?.phone ?? input.replace(/\D/g, '');
		cookies.set(COOKIE, match?.phone ?? input, cookieOptions);
		if (match && isVerified(match.phone, cookies)) return { ...match, verified: true };
		return { phone, verified: false, invited: Boolean(match) };
	} catch (error) {
		console.error('Could not load the guest list', error);
		return { unavailable: true };
	}
}

function signature(phone: string) {
	return createHmac('sha256', SESSION_SECRET).update(phone).digest('base64url');
}

function isVerified(phone: string, cookies: AstroCookies) {
	const value = Buffer.from(cookies.get(VERIFIED_COOKIE)?.value ?? '');
	const expected = Buffer.from(signature(phone));
	return value.length === expected.length && timingSafeEqual(value, expected);
}

export function rememberVerified(phone: string, cookies: AstroCookies) {
	cookies.set(VERIFIED_COOKIE, signature(phone), cookieOptions);
	cookies.delete(CODE_SENT_COOKIE, { path: '/' });
}

export function rememberCodeSent(phone: string, cookies: AstroCookies) {
	// Matches how long a Twilio Verify code stays valid
	cookies.set(CODE_SENT_COOKIE, phone, { ...cookieOptions, maxAge: 10 * 60 });
}

export function forgetCodeSent(cookies: AstroCookies) {
	cookies.delete(CODE_SENT_COOKIE, { path: '/' });
}

export function codeSentTo(phone: string, cookies: AstroCookies) {
	return cookies.get(CODE_SENT_COOKIE)?.value === phone;
}
