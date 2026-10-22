import { cleanName, type Household, type Rsvp } from './guests';

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
	const invited = form
		.getAll('guest')
		.map(String)
		.filter((name) => household.guests.includes(name));
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
