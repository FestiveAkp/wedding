import { cleanName, saveRsvp, type Household, type Rsvp } from '@/lib/guests';

/** What the reply form shows; `names` is unset when everyone invited should start selected */
export interface Draft {
	attending?: boolean;
	names?: string[];
	message: string;
}

/** The form starts from the latest reply, with everyone selected until a reply says otherwise. */
export function draftFrom(rsvp?: Rsvp): Draft {
	return {
		attending: rsvp?.attending,
		names: rsvp?.attending ? rsvp.names : undefined,
		message: rsvp?.message ?? '',
	};
}

/**
 * Reads a submitted reply form. `rsvp` is set when it's ready to save; otherwise `error` says why not.
 * `draft` is always what the guest submitted, so the form can show it again.
 */
export function parseReply(form: FormData, household: Household): { rsvp?: Rsvp; error?: string; draft: Draft } {
	const reply = form.get('attending');
	// A Set, so a name sent twice can't push the count past `maxGuests`
	const invited = [...new Set(form.getAll('guest').map(String))].filter((name) => household.guests.includes(name));
	const plusOnes = form
		.getAll('plusOne')
		.map((name) => cleanName(String(name)))
		.filter(Boolean)
		.slice(0, household.maxGuests - household.guests.length);
	const names = household.maxGuests === 1 ? household.guests : [...invited, ...plusOnes];
	const message = String(form.get('message') ?? '')
		.trim()
		.slice(0, 2000);

	const draft = { attending: reply === 'yes' ? true : reply === 'no' ? false : undefined, names, message };
	if (reply !== 'yes' && reply !== 'no') return { draft, error: 'Please let us know whether you can make it.' };
	if (reply === 'yes' && names.length === 0) return { draft, error: 'Please let us know who will be coming.' };
	return { draft, rsvp: { attending: reply === 'yes', names: reply === 'yes' ? names : [], message } };
}

/** What became of a posted reply: reload at `redirect` once saved, otherwise show `draft` again with `error` */
export interface ReplyResult {
	redirect?: string;
	error?: string;
	draft?: Draft;
}

/**
 * Saves a verified guest's reply form, if that's what was posted. On success the page reloads
 * with `?saved`, which shows the thank-you note and keeps a refresh from saving twice.
 */
export async function handleReply(form: FormData | undefined, household: Household, phone: string, url: URL): Promise<ReplyResult> {
	// Match the intent rather than any post: a stale code check (e.g. a double-tapped button)
	// can arrive after the guest is already verified, and mustn't be read as a reply
	if (!form || form.get('intent') !== 'reply') return {};
	const { rsvp, error, draft } = parseReply(form, household);
	if (!rsvp) return { error, draft };
	try {
		await saveRsvp(household, phone, rsvp);
	} catch (e) {
		console.error('Could not save RSVP', e);
		return { draft, error: 'Something went wrong saving your reply. Please try again in a few minutes.' };
	}
	const done = new URL(url);
	done.searchParams.set('saved', rsvp.attending ? 'yes' : 'no');
	return { redirect: done.pathname + done.search };
}
