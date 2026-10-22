export interface Section {
	href: string
	no: string
	title: string
	dek: string
}

export const sections: Section[] = [
	{
		href: '/welcome/',
		no: '01',
		title: 'Welcome',
		dek: 'Why Kerala, and why we can’t wait to celebrate with you.',
	},
	{
		href: '/schedule/',
		no: '02',
		title: 'Schedule',
		dek: 'A temple at dawn, a wedding at The Leela, lunch by the sea.',
	},
	{
		href: '/travel/',
		no: '03',
		title: 'Travel',
		dek: 'Flying into Trivandrum and finding your way to Kovalam.',
	},
	{
		href: '/faq/',
		no: '04',
		title: 'FAQ',
		dek: 'What to wear, little ones, and gifts.',
	},
	{
		href: '/rsvp/',
		no: '05',
		title: 'RSVP',
		dek: 'How and when to let us know you’re coming.',
	},
]

const normalize = (path: string) => path.replace(/\/+$/, '')

export function findSection(pathname: string) {
	const index = sections.findIndex((s) => normalize(s.href) === normalize(pathname))
	return { section: sections[index], next: sections[index + 1] }
}
