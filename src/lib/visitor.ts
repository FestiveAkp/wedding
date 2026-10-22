import type { AstroCookies } from 'astro'
import { findHousehold, type Household } from './guests'

const COOKIE = 'guest'

export interface Visitor {
	household?: Household
	/** Full phone number that matched, digits only */
	phone?: string
	/** A number was entered but isn't on the guest list */
	notFound?: boolean
	/** The guest list couldn't be loaded */
	unavailable?: boolean
}

/**
 * Identifies the guest from `?p=` (the WhatsApp link or the phone form) or, failing
 * that, the cookie set on an earlier visit. `?switch` forgets the remembered number.
 */
export async function identifyVisitor(url: URL, cookies: AstroCookies): Promise<Visitor> {
	if (url.searchParams.has('switch')) {
		cookies.delete(COOKIE, { path: '/' })
		return {}
	}

	const entered = url.searchParams.get('p')?.trim()
	const remembered = cookies.get(COOKIE)?.value
	const input = entered || remembered
	if (!input) return {}

	try {
		const match = await findHousehold(input)
		if (!match) {
			if (!entered) cookies.delete(COOKIE, { path: '/' })
			return { notFound: Boolean(entered) }
		}
		cookies.set(COOKIE, match.phone, {
			path: '/',
			httpOnly: true,
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			maxAge: 400 * 24 * 60 * 60,
		})
		return match
	} catch (error) {
		console.error('Could not load the guest list', error)
		return { unavailable: true }
	}
}
