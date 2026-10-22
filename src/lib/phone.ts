// Country codes tried when a guest types a number without one, so "224 817 2107"
// and "093888 18882" both match sheet entries stored with their country code.
const COUNTRY_CODES = ['91', '1', '971', '44', '974', '966', '965', '968', '973', '61', '65']

/** Normalizes a sheet Contact cell like "1 (224) 817-2107" to "12248172107". */
export function sheetPhone(value: string): string | undefined {
	const digits = value.replace(/\D/g, '')
	return digits.length >= 8 ? digits : undefined
}

/** Every full number (country code + national number) a guest's input could mean. */
export function phoneCandidates(input: string): string[] {
	const digits = input.replace(/\D/g, '')
	if (/^\s*(\+|00)/.test(input)) return [digits.replace(/^00/, '')]

	const national = digits.replace(/^0+/, '')
	if (national.length < 7) return []
	return [national, ...COUNTRY_CODES.map((code) => code + national)]
}
