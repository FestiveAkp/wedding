import type { EventId } from '../lib/guests'

export interface WeddingEvent {
	title: string
	place: string
	/** Omit until the date is set */
	date?: { weekday: string; day: string; month: string }
	time?: string
	description: string
}

// TODO: fill in times, venues and descriptions once they're set
export const invitationEvents: Record<EventId, WeddingEvent> = {
	welcome: {
		title: 'Welcome party',
		place: 'Venue to be announced',
		date: { weekday: 'Saturday', day: '26', month: 'June 2027' },
		description: 'An evening to kick off the celebrations together. More details soon.',
	},
	mehndi: {
		title: 'Mehndi night',
		place: 'Venue to be announced',
		date: { weekday: 'Friday', day: '25', month: 'June 2027' },
		description: 'Henna, music and dancing. More details soon.',
	},
}

// Listed in the order they happen
export const eventOrder: EventId[] = ['mehndi', 'welcome']
