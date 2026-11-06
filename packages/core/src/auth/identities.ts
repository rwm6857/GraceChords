// Linked sign-in methods (Supabase identities) — pure helpers shared by the web
// and mobile Security sections.
//
// Supabase links identities that share a verified email automatically. Manual
// linking (linkIdentity) is for the rest — chiefly Apple "Hide My Email"
// accounts, whose privaterelay.appleid.com address never matches anything.

/** Providers a user can connect or disconnect from the Security section. */
export const LINKABLE_PROVIDERS = ['apple', 'google'] as const
export type LinkableProvider = (typeof LINKABLE_PROVIDERS)[number]

type IdentityLike = {
  provider?: string | null
  identity_data?: { email?: unknown } | null
}

export function findIdentity<T extends IdentityLike>(
  identities: ReadonlyArray<T> | null | undefined,
  provider: string,
): T | null {
  return (identities ?? []).find(i => i?.provider === provider) ?? null
}

/** The email the provider reported for this identity, if any. */
export function identityEmail(identity: IdentityLike | null | undefined): string | null {
  const email = identity?.identity_data?.email
  return typeof email === 'string' && email ? email : null
}

/**
 * GoTrue refuses to unlink an account's last identity
 * (single_identity_not_deletable); mirror that so the button never offers it.
 */
export function canUnlink(identities: ReadonlyArray<unknown> | null | undefined): boolean {
  return (identities?.length ?? 0) >= 2
}
