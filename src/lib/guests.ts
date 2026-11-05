import { appendRow, getValues } from '@/lib/sheets';
import { phoneCandidates, sheetPhone } from '@/lib/phone';

export type EventId = 'welcome' | 'mehndi';

export interface Household {
	id: string;
	greeting: string;
	maxGuests: number;
	/** Full names of the invited guests; any remaining seats are unnamed plus-ones */
	guests: string[];
	/** Events beyond the wedding, which everyone is invited to */
	events: EventId[];
}

export interface Rsvp {
	attending: boolean;
	/** Names of everyone in the household who is coming */
	names: string[];
	message: string;
}

const GUEST_RANGE = `'Guest List'!A:Z`;
const RSVP_RANGE = `'RSVPs'!A:H`;
const CACHE_MS = 60_000;

// Only these columns are read; everything else in the sheet stays private
const COLUMNS = {
	name: 'Name',
	household: 'Household ID',
	maxGuests: 'Max Guest Count',
	contact: 'Contact',
};

const EVENT_COLUMNS: Record<EventId, string> = {
	welcome: 'Invited to Welcome Party?',
	mehndi: 'Invited to Mehendi?',
};

interface GuestList {
	households: Map<string, Household>;
	/** Full phone number (digits only) → household ID */
	phones: Map<string, string>;
}

let cache: { at: number; list: GuestList } | undefined;

async function guestList(): Promise<GuestList> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.list;
	try {
		const rows = await getValues(GUEST_RANGE);
		cache = { at: Date.now(), list: parseGuestRows(rows) };
	} catch (error) {
		// Keep serving the last good copy if Google has a bad minute
		if (!cache) throw error;
		console.error('Guest list refresh failed, serving cached copy', error);
	}
	return cache.list;
}

/** Each row is one guest; rows sharing a Household ID RSVP together. */
function parseGuestRows([header = [], ...rows]: string[][]): GuestList {
	const columnIndex = (title: string) => {
		const index = header.findIndex((h) => h.trim() === title);
		if (index === -1) throw new Error(`Guest list is missing the "${title}" column`);
		return index;
	};
	const column = Object.fromEntries(
		Object.entries(COLUMNS).map(([key, title]) => [key, columnIndex(title)]),
	) as Record<keyof typeof COLUMNS, number>;
	const eventColumns = Object.entries(EVENT_COLUMNS).map(
		([event, title]) => [event as EventId, columnIndex(title)] as const,
	);

	const households = new Map<string, Household>();
	const names = new Map<string, string[]>();
	const phones = new Map<string, string>();

	rows.forEach((row, i) => {
		const cell = (index: number) => (row[index] ?? '').trim();
		const id = cell(column.household);
		const name = cell(column.name);
		if (!id || !name) return;

		let household = households.get(id);
		if (!household) {
			household = { id, greeting: '', maxGuests: 0, guests: [], events: [] };
			households.set(id, household);
			names.set(id, []);
		}
		names.get(id)!.push(name.split(/\s+/)[0]);
		household.guests.push(name);
		household.maxGuests += parseInt(cell(column.maxGuests)) || 1;
		for (const [event, index] of eventColumns) {
			if (cell(index) === 'TRUE' && !household.events.includes(event)) household.events.push(event);
		}

		const phone = sheetPhone(cell(column.contact));
		if (!phone) return;
		if (phones.has(phone) && phones.get(phone) !== id) {
			console.warn(`Row ${i + 2}: phone is already used by household ${phones.get(phone)}`);
			return;
		}
		phones.set(phone, id);
	});

	for (const household of households.values()) household.greeting = joinNames(names.get(household.id)!);
	return { households, phones };
}

export function joinNames(names: string[]) {
	return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;
}

/** Finds the household a guest-typed phone number belongs to, along with the matched full number. */
export async function findHousehold(input: string) {
	const { households, phones } = await guestList();
	for (const phone of phoneCandidates(input)) {
		const id = phones.get(phone);
		if (id) return { household: households.get(id)!, phone };
	}
}

/** Names are stored comma-separated, so commas can't appear inside one. */
export function cleanName(name: string) {
	return name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export async function latestRsvp(household: Household): Promise<Rsvp | undefined> {
	const rows = await getValues(RSVP_RANGE);
	const row = rows.findLast((r) => r[1] === household.id);
	if (!row) return;
	const names = (row[6] ?? '').split(', ').filter(Boolean);
	return { attending: row[4] === 'Yes', names, message: row[7] ?? '' };
}

export async function saveRsvp(household: Household, phone: string, rsvp: Rsvp) {
	const row = [
		new Date().toISOString(),
		household.id,
		household.greeting,
		phone,
		rsvp.attending ? 'Yes' : 'No',
		rsvp.names.length,
		rsvp.names.join(', '),
		rsvp.message,
	];
	await appendRow(RSVP_RANGE, row);
}

const LOGIN_RANGE = `'Logins'!A:F`;

/** How a guest got in: a texted code, or a number already verified on this device */
export type LoginMethod = 'Code' | 'Already verified';

/** Records a guest signing in. Never throws, so a logging hiccup can't keep anyone out. */
export async function logLogin(phone: string, method: LoginMethod, page: string) {
	// Local dev sign-ins aren't real guests, so keep them out of the sheet
	if (import.meta.env.DEV) return;
	try {
		const household = (await findHousehold(phone))?.household;
		await appendRow(LOGIN_RANGE, [new Date().toISOString(), household?.id ?? '', household ? joinNames(household.guests) : '', phone, method, page]);
	} catch (e) {
		console.error('Could not log login', e);
	}
}
