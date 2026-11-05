import type { AstroCookies, AstroGlobal } from 'astro';
import { logLogin } from '@/lib/guests';
import { checkCode, sendCode } from '@/lib/twilio';
import { codeSentTo, forgetCodeSent, identifyVisitor, rememberCodeSent, rememberVerified, type Visitor } from '@/lib/visitor';

const SERVER_ERROR = 'Something went wrong on our end. Please try again in a few minutes.';

/** Whether to ask for the code, and why the last post didn't work if it didn't */
export interface VerifyState {
	codeSent: boolean;
	error?: string;
}

/** Who's visiting and, before they've confirmed their number, where they are in that */
export interface Gate {
	/** The post worked and the page should reload here, so a refresh doesn't resubmit it */
	redirect?: string;
	form?: FormData;
	visitor: Visitor;
	verify?: VerifyState;
}

/**
 * Identifies the guest on a page that's private until their number is confirmed, and handles
 * the phone and code forms. Every form on such a page posts back to it, with an `intent`
 * saying which one it was; any posted `form` is returned for the page's own forms.
 */
export async function guestGate({ request, url, cookies }: Pick<AstroGlobal, 'request' | 'url' | 'cookies'>): Promise<Gate> {
	const form = request.method === 'POST' ? await request.formData() : undefined;
	/** The number typed into the phone form, if that's what was just submitted */
	const entered = form?.get('intent') === 'find' ? String(form.get('phone') ?? '') : undefined;
	const visitor = await identifyVisitor(url, cookies, entered);

	// Already verified on an earlier visit, so there's no code to send. The number is in the
	// cookie now, so reload as a GET to keep a refresh from resubmitting the form.
	if (entered && visitor.verified) {
		await logLogin(visitor.phone, 'Already verified', url.pathname);
		return { redirect: url.pathname, form, visitor };
	}
	if (!visitor.phone || visitor.verified) return { form, visitor };

	// In local dev, an invited number counts as verified without a text. `import.meta.env.DEV`
	// is replaced at build time, so this is dropped from production builds entirely.
	if (import.meta.env.DEV && visitor.invited) {
		rememberVerified(visitor.phone, cookies);
		return { redirect: url.pathname + url.search, form, visitor };
	}

	// Someone who has entered a number but not a code yet can only find their invitation, ask
	// for a code or check one; any other post is ignored
	const verify = await verifyStep(form, visitor.phone, visitor.invited, cookies);
	if (verify === 'verified') await logLogin(visitor.phone, 'Code', url.pathname);
	if (verify === 'redirect' || verify === 'verified') return { redirect: url.pathname + url.search, form, visitor };
	return { form, visitor, verify };
}

/**
 * Handles the posts accepted from a guest who hasn't confirmed their number yet: finding their
 * invitation, asking for a code and checking it. Returns 'redirect' when the post worked and
 * the page should reload, so a refresh doesn't resubmit the form, or 'verified' when it was a
 * correct code (which also reloads).
 *
 * A number that isn't `invited` goes through the same steps, but no code is sent and every
 * code is wrong, so the page never says whether a number is on the guest list.
 */
export async function verifyStep(
	form: FormData | undefined,
	phone: string,
	invited: boolean,
	cookies: AstroCookies,
): Promise<'redirect' | 'verified' | VerifyState> {
	const codeSent = codeSentTo(phone, cookies);
	const intent = form?.get('intent');

	// Send the code straight away rather than making the guest ask for one
	if (intent === 'find' && codeSent) return 'redirect';
	if (intent === 'find' || intent === 'send') {
		if (!invited) {
			rememberCodeSent(phone, cookies);
			return 'redirect';
		}
		try {
			if ((await sendCode(phone)) === 'sent') {
				rememberCodeSent(phone, cookies);
				return 'redirect';
			}
			return { codeSent, error: 'We’ve sent a few codes already. Please wait 10 minutes and try again.' };
		} catch (e) {
			console.error('Could not send code', e);
			return { codeSent, error: SERVER_ERROR };
		}
	}

	if (intent === 'check') {
		const code = String(form?.get('code') ?? '').replace(/\D/g, '');
		try {
			const result = code && invited ? await checkCode(phone, code) : 'wrong';
			if (result === 'approved') {
				rememberVerified(phone, cookies);
				return 'verified';
			}
			if (result === 'wrong') return { codeSent, error: 'That code doesn’t match. Please check it and try again.' };
			// Forget the code too, so a refresh doesn't bring back a code box that can't succeed
			forgetCodeSent(cookies);
			return { codeSent: false, error: 'That code has expired. Please send yourself a new one.' };
		} catch (e) {
			console.error('Could not verify phone', e);
			return { codeSent, error: SERVER_ERROR };
		}
	}

	return { codeSent };
}
