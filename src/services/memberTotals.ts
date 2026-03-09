import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { buildMemberKey, normalizeMemberName, toCanonicalMemberKey } from './memberKeys';
import { roundPointsValue } from '@/utils/helpers';

export interface ScoreEntryLike {
    teamId?: string | null;
    stageId?: string | null;
    targetType?: string | null;
    type?: 'earn' | 'deduct' | string;
    points?: number | null;
    memberName?: string | null;
    memberKey?: string | null;
    memberUserId?: string | null;
}

export interface AggregatedMemberTotal {
    id: string;
    memberName: string;
    teamId: string;
    stageId: string | null;
    totalPoints: number;
    memberKey?: string | null;
    memberUserId?: string | null;
}

export interface MemberStatEntryLike {
    teamId?: string | null;
    stageId?: string | null;
    memberName?: string | null;
    memberKey?: string | null;
    memberUserId?: string | null;
    totalPoints?: number | null;
}

interface MergeTeamMemberTotalsArgs {
    teamId: string;
    teamMembers?: string[] | null;
    entries: MemberStatEntryLike[];
    resolveStageId?: (teamId: string) => string | null;
}

const deriveLegacyNameFromKey = (memberKey?: string | null): string | null => {
    if (!memberKey || !memberKey.startsWith('n:')) return null;
    const parts = memberKey.split(':');
    if (parts.length < 3) return null;
    const rawSlug = parts.slice(2).join(':').trim();
    if (!rawSlug) return null;
    const candidate = rawSlug.replace(/_/g, ' ').trim();
    return candidate || null;
};

export const aggregateMemberTotals = (
    entries: ScoreEntryLike[],
    resolveStageId?: (teamId: string) => string | null
): AggregatedMemberTotal[] => {
    const grouped = new Map<string, AggregatedMemberTotal>();

    for (const score of entries) {
        if ((score.targetType ?? 'team') !== 'member') continue;

        const teamId = typeof score.teamId === 'string' ? score.teamId.trim() : '';
        if (!teamId) continue;

        const rawMemberName =
            (typeof score.memberName === 'string' ? score.memberName.trim() : '') ||
            deriveLegacyNameFromKey(score.memberKey) ||
            '';
        const normalizedName = normalizeMemberName(rawMemberName);
        if (!normalizedName) continue;

        const numericPoints = Number(score.points || 0);
        if (!Number.isFinite(numericPoints)) continue;
        const pointDelta = score.type === 'deduct'
            ? -Math.abs(numericPoints)
            : Math.abs(numericPoints);

        const id = `${teamId}:${normalizedName}`;
        const existing = grouped.get(id);
        if (existing) {
            existing.totalPoints += pointDelta;
            if (!existing.stageId) {
                existing.stageId = score.stageId || resolveStageId?.(teamId) || null;
            }
            if (!existing.memberKey && typeof score.memberKey === 'string' && score.memberKey.trim()) {
                existing.memberKey = score.memberKey;
            }
            if (!existing.memberUserId && typeof score.memberUserId === 'string' && score.memberUserId.trim()) {
                existing.memberUserId = score.memberUserId;
            }
            continue;
        }

        grouped.set(id, {
            id,
            memberName: rawMemberName,
            teamId,
            stageId: score.stageId || resolveStageId?.(teamId) || null,
            totalPoints: pointDelta,
            memberKey: typeof score.memberKey === 'string' ? score.memberKey : null,
            memberUserId: typeof score.memberUserId === 'string' ? score.memberUserId : null,
        });
    }

    return Array.from(grouped.values());
};

export const aggregateMemberTotalsFromDocs = (
    docs: Array<QueryDocumentSnapshot<DocumentData>>,
    resolveStageId?: (teamId: string) => string | null
): AggregatedMemberTotal[] =>
    aggregateMemberTotals(
        docs.map((doc) => doc.data() as ScoreEntryLike),
        resolveStageId
    );

const asNonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const resolveDisplayName = (entry: Pick<MemberStatEntryLike, 'memberName' | 'memberKey'>): string => {
    const directName = asNonEmptyString(entry.memberName);
    if (directName) return directName;
    return deriveLegacyNameFromKey(entry.memberKey) || 'غير معروف';
};

const resolveMemberIdentity = (entry: MemberStatEntryLike): string | null => {
    const teamId = asNonEmptyString(entry.teamId);
    const memberUserId = asNonEmptyString(entry.memberUserId);
    if (memberUserId) return `u:${memberUserId}`;

    const canonicalKey = toCanonicalMemberKey({
        teamId,
        memberKey: asNonEmptyString(entry.memberKey),
        memberUserId,
        memberName: resolveDisplayName(entry),
    });
    if (canonicalKey) return canonicalKey;

    const memberName = resolveDisplayName(entry);
    const normalizedName = normalizeMemberName(memberName);
    if (teamId && normalizedName) return `n:${teamId}:${normalizedName}`;

    return null;
};

export const aggregateMemberStatsTotals = (
    entries: MemberStatEntryLike[],
    resolveStageId?: (teamId: string) => string | null
): AggregatedMemberTotal[] => {
    const grouped = new Map<string, AggregatedMemberTotal>();

    for (const entry of entries) {
        const teamId = asNonEmptyString(entry.teamId);
        if (!teamId) continue;

        const identity = resolveMemberIdentity(entry);
        if (!identity) continue;

        const numericPoints = Number(entry.totalPoints || 0);
        if (!Number.isFinite(numericPoints)) continue;

        const memberName = resolveDisplayName(entry);
        const stageId = asNonEmptyString(entry.stageId) || resolveStageId?.(teamId) || null;
        const memberKey = toCanonicalMemberKey({
            teamId,
            memberKey: asNonEmptyString(entry.memberKey),
            memberUserId: asNonEmptyString(entry.memberUserId),
            memberName,
        });
        const memberUserId = asNonEmptyString(entry.memberUserId);

        const existing = grouped.get(identity);
        if (existing) {
            existing.totalPoints += numericPoints;
            if ((!existing.memberName || existing.memberName === 'غير معروف') && memberName) {
                existing.memberName = memberName;
            }
            if (!existing.stageId) existing.stageId = stageId;
            if (!existing.memberKey && memberKey) existing.memberKey = memberKey;
            if (!existing.memberUserId && memberUserId) existing.memberUserId = memberUserId;
            continue;
        }

        grouped.set(identity, {
            id: identity,
            memberName,
            teamId,
            stageId,
            totalPoints: numericPoints,
            memberKey,
            memberUserId,
        });
    }

    return Array.from(grouped.values()).map((entry) => ({
        ...entry,
        totalPoints: roundPointsValue(Number(entry.totalPoints || 0)),
    }));
};

export const aggregateMemberStatsTotalsFromDocs = (
    docs: Array<QueryDocumentSnapshot<DocumentData>>,
    resolveStageId?: (teamId: string) => string | null
): AggregatedMemberTotal[] =>
    aggregateMemberStatsTotals(
        docs.map((doc) => doc.data() as MemberStatEntryLike),
        resolveStageId
    );

export const mergeTeamMemberTotals = ({
    teamId,
    teamMembers = [],
    entries,
    resolveStageId,
}: MergeTeamMemberTotalsArgs): AggregatedMemberTotal[] => {
    const resolvedStageId = resolveStageId?.(teamId) || null;
    const aggregated = aggregateMemberStatsTotals(
        entries.filter((entry) => asNonEmptyString(entry.teamId) === teamId),
        resolveStageId
    );

    const statsByIdentity = new Map<string, AggregatedMemberTotal>();
    const statsByName = new Map<string, AggregatedMemberTotal>();

    aggregated.forEach((entry) => {
        statsByIdentity.set(entry.id, entry);
        const normalizedName = normalizeMemberName(entry.memberName || '');
        if (normalizedName && !statsByName.has(normalizedName)) {
            statsByName.set(normalizedName, entry);
        }
    });

    const merged: AggregatedMemberTotal[] = [];
    const consumed = new Set<string>();
    const seenTeamMembers = new Set<string>();

    for (const rawMemberName of teamMembers) {
        const memberName = asNonEmptyString(rawMemberName);
        if (!memberName) continue;

        const normalizedName = normalizeMemberName(memberName);
        if (!normalizedName || seenTeamMembers.has(normalizedName)) continue;
        seenTeamMembers.add(normalizedName);

        const fallbackKey = buildMemberKey({ teamId, memberName });
        const matched = (fallbackKey ? statsByIdentity.get(fallbackKey) : null) || statsByName.get(normalizedName);

        if (matched) {
            merged.push({
                ...matched,
                memberName: memberName || matched.memberName,
            });
            consumed.add(matched.id);
            continue;
        }

        merged.push({
            id: fallbackKey || `${teamId}:${normalizedName}`,
            memberName,
            teamId,
            stageId: resolvedStageId,
            totalPoints: 0,
            memberKey: fallbackKey,
            memberUserId: null,
        });
    }

    aggregated.forEach((entry) => {
        if (consumed.has(entry.id)) return;
        merged.push(entry);
    });

    return merged.map((entry) => ({
        ...entry,
        totalPoints: roundPointsValue(Number(entry.totalPoints || 0)),
    })).sort((a, b) => {
        const pointDiff = Number(b.totalPoints || 0) - Number(a.totalPoints || 0);
        if (pointDiff !== 0) return pointDiff;
        return String(a.memberName || '').localeCompare(String(b.memberName || ''), 'ar');
    });
};
