export interface MemberKeyInput {
    teamId?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    memberKey?: string | null;
}

export const normalizeMemberName = (name: string): string =>
    name.toLowerCase().trim().replace(/\s+/g, ' ');

const parseLegacyMemberKey = (memberKey: string): { teamId: string; slug: string } | null => {
    if (!memberKey.startsWith('n:')) return null;
    const firstSep = memberKey.indexOf(':', 2);
    if (firstSep <= 2 || firstSep >= memberKey.length - 1) return null;
    const teamId = memberKey.slice(2, firstSep).trim();
    const rawSlug = memberKey.slice(firstSep + 1).trim();
    if (!teamId || !rawSlug) return null;
    const slug = normalizeMemberName(rawSlug.replace(/_/g, ' '));
    return slug ? { teamId, slug } : null;
};

export const buildMemberKey = (input: MemberKeyInput): string | null => {
    const userId = input.memberUserId?.trim();
    if (userId) return `u:${userId}`;

    const teamId = input.teamId?.trim();
    const memberName = input.memberName?.trim();
    if (!teamId || !memberName) return null;

    const slug = normalizeMemberName(memberName);
    if (!slug) return null;
    return `n:${teamId}:${slug}`;
};

export const toCanonicalMemberKey = (input: MemberKeyInput): string | null => {
    const key = input.memberKey?.trim();
    if (key) {
        if (key.startsWith('u:')) return key;
        const parsed = parseLegacyMemberKey(key);
        if (parsed) return `n:${parsed.teamId}:${parsed.slug}`;
    }

    return buildMemberKey(input);
};

export const buildMemberKeyAliases = (input: MemberKeyInput): string[] => {
    const aliases = new Set<string>();
    const addLegacyVariants = (canonicalOrLegacyKey: string) => {
        aliases.add(canonicalOrLegacyKey);
        const parsed = parseLegacyMemberKey(canonicalOrLegacyKey);
        if (!parsed) return;
        aliases.add(`n:${parsed.teamId}:${parsed.slug}`);
        aliases.add(`n:${parsed.teamId}:${parsed.slug.replace(/\s+/g, '_')}`);
    };

    const rawKey = input.memberKey?.trim();
    if (rawKey) {
        addLegacyVariants(rawKey);
    }

    const canonical = toCanonicalMemberKey(input);
    if (canonical) {
        addLegacyVariants(canonical);
    }

    const userId = input.memberUserId?.trim();
    if (userId) aliases.add(`u:${userId}`);

    return [...aliases];
};
