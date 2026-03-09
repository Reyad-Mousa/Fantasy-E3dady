import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { getCachedTasks, getUnsyncedScores } from './offlineDb';
import { buildMemberKeyAliases, normalizeMemberName, toCanonicalMemberKey } from './memberKeys';

interface ScoreDocLike {
    taskId?: string | null;
    targetType?: string | null;
    type?: 'earn' | 'deduct' | string;
    points?: number;
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    teamId?: string | null;
    stageId?: string | null;
    customNote?: string | null;
    registeredByName?: string | null;
    timestamp?: unknown;
}

export interface MemberScoreHistoryTarget {
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName: string;
    teamId: string;
    stageId?: string | null;
    totalPoints?: number | null;
}

export interface MemberScoreHistoryItem {
    id: string;
    taskId: string | null;
    taskTitle: string;
    points: number;
    type: 'earn' | 'deduct';
    actorName: string | null;
    customNote: string | null;
    stageId: string | null;
    timestamp: unknown;
    pending: boolean;
}

interface GetMemberScoreHistoryArgs {
    target: MemberScoreHistoryTarget;
    stageId?: string | null;
    online: boolean;
    maxItems?: number;
}

interface MemberStatDocLike {
    teamId?: string | null;
    stageId?: string | null;
    memberName?: string | null;
    memberKey?: string | null;
    memberUserId?: string | null;
    totalPoints?: number | null;
    updatedAt?: unknown;
}

const asTrimmedString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const isPermissionDeniedError = (error: unknown) =>
    Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'permission-denied'
    );

const hasExplicitMemberIdentity = (score: Pick<ScoreDocLike, 'memberKey' | 'memberUserId' | 'memberName' | 'teamId'>) =>
    Boolean(
        asTrimmedString(score.memberKey) ||
        asTrimmedString(score.memberUserId) ||
        (asTrimmedString(score.teamId) && asTrimmedString(score.memberName))
    );

const isMemberScore = (score: ScoreDocLike) => {
    const targetType = asTrimmedString(score.targetType);
    if (targetType === 'member') return true;
    if (targetType === 'team') return false;
    return hasExplicitMemberIdentity(score);
};

const matchesTargetScore = (
    score: ScoreDocLike,
    target: MemberScoreHistoryTarget,
    aliases: Set<string>,
    normalizedTargetName: string
) => {
    if (!isMemberScore(score)) return false;

    const targetTeamId = asTrimmedString(target.teamId);
    const scoreTeamId = asTrimmedString(score.teamId);
    const sameTeam = !targetTeamId || !scoreTeamId || targetTeamId === scoreTeamId;

    const scoreMemberKey = asTrimmedString(score.memberKey);
    if (scoreMemberKey && aliases.has(scoreMemberKey)) {
        if (scoreMemberKey.startsWith('u:')) return sameTeam;
        return true;
    }

    const targetMemberUserId = asTrimmedString(target.memberUserId);
    const scoreMemberUserId = asTrimmedString(score.memberUserId);
    if (targetMemberUserId && scoreMemberUserId === targetMemberUserId) return sameTeam;

    const scoreMemberName = normalizeMemberName(asTrimmedString(score.memberName) || '');

    return Boolean(
        targetTeamId &&
        scoreTeamId === targetTeamId &&
        normalizedTargetName &&
        scoreMemberName === normalizedTargetName
    );
};

const scoreTargetRank = (
    stat: MemberStatDocLike,
    target: MemberScoreHistoryTarget,
    aliases: Set<string>,
    normalizedTargetName: string
) => {
    const statUserId = asTrimmedString(stat.memberUserId);
    const targetUserId = asTrimmedString(target.memberUserId);
    if (targetUserId && statUserId === targetUserId) return 4;

    const statKey = asTrimmedString(stat.memberKey);
    if (statKey && aliases.has(statKey)) return 3;

    const canonicalStatKey = toCanonicalMemberKey({
        teamId: asTrimmedString(stat.teamId),
        memberKey: statKey,
        memberUserId: statUserId,
        memberName: asTrimmedString(stat.memberName),
    });
    if (canonicalStatKey && aliases.has(canonicalStatKey)) return 3;

    const statName = normalizeMemberName(asTrimmedString(stat.memberName) || '');
    if (normalizedTargetName && statName === normalizedTargetName) return 1;

    return 0;
};

const resolveTargetFromMemberStats = async (
    target: MemberScoreHistoryTarget,
    aliases: string[]
): Promise<MemberScoreHistoryTarget> => {
    const teamId = asTrimmedString(target.teamId);
    if (!teamId) return target;

    const aliasSet = new Set(aliases);
    const normalizedTargetName = normalizeMemberName(target.memberName || '');

    try {
        const snapshot = await getDocs(query(collection(db, 'member_stats'), where('teamId', '==', teamId)));
        let bestMatch: MemberStatDocLike | null = null;
        let bestRank = 0;

        snapshot.forEach((entry) => {
            const stat = entry.data() as MemberStatDocLike;
            const rank = scoreTargetRank(stat, target, aliasSet, normalizedTargetName);
            if (rank > bestRank) {
                bestRank = rank;
                bestMatch = stat;
            }
        });

        if (!bestMatch || bestRank === 0) return target;

        const memberName = asTrimmedString(bestMatch.memberName) || target.memberName;
        return {
            ...target,
            memberName,
            memberKey: asTrimmedString(bestMatch.memberKey) || target.memberKey || null,
            memberUserId: asTrimmedString(bestMatch.memberUserId) || target.memberUserId || null,
            stageId: asTrimmedString(bestMatch.stageId) || target.stageId || null,
        };
    } catch {
        return target;
    }
};

const loadCachedTasksSafely = async () => {
    try {
        return await getCachedTasks();
    } catch (error) {
        console.warn('Failed to read cached tasks for member history:', error);
        return [];
    }
};

const loadUnsyncedScoresSafely = async () => {
    try {
        return await getUnsyncedScores();
    } catch (error) {
        console.warn('Failed to read pending scores for member history:', error);
        return [];
    }
};

const toTaskTitleMap = async (taskIds: string[], online: boolean) => {
    const titles = new Map<string, string>();
    const cachedTasks = await loadCachedTasksSafely();
    for (const task of cachedTasks) {
        titles.set(task.taskId, task.title);
    }

    if (!online) return titles;

    await Promise.all(taskIds.map(async (taskId) => {
        if (titles.has(taskId)) return;
        try {
            const taskDoc = await getDoc(doc(db, 'tasks', taskId));
            if (!taskDoc.exists()) return;
            const title = taskDoc.data().title;
            if (typeof title === 'string' && title.trim()) titles.set(taskId, title.trim());
        } catch {
            // Ignore missing task docs; fallback title will be used.
        }
    }));

    return titles;
};

const toHistoryItem = (
    id: string,
    score: ScoreDocLike,
    taskTitles: Map<string, string>,
    pending: boolean
): MemberScoreHistoryItem | null => {
    if (!isMemberScore(score)) return null;
    const type = score.type === 'deduct' ? 'deduct' : 'earn';
    const taskId = typeof score.taskId === 'string' ? score.taskId : null;
    return {
        id,
        taskId,
        taskTitle: (taskId ? taskTitles.get(taskId) : null) || score.customNote || 'مهمة مخصصة',
        points: Number(Math.abs(Number(score.points || 0)).toFixed(2)),
        type,
        actorName: typeof score.registeredByName === 'string' ? score.registeredByName : null,
        customNote: typeof score.customNote === 'string' ? score.customNote : null,
        stageId: typeof score.stageId === 'string' ? score.stageId : null,
        timestamp: score.timestamp ?? null,
        pending,
    };
};

const sortByNewest = (a: MemberScoreHistoryItem, b: MemberScoreHistoryItem) => {
    const toMs = (value: unknown) => {
        if (!value) return 0;
        if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
            return (value as { toDate: () => Date }).toDate().getTime();
        }
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        return 0;
    };
    return toMs(b.timestamp) - toMs(a.timestamp);
};

export async function getMemberScoreHistory({
    target,
    stageId = null,
    online,
    maxItems = 50,
}: GetMemberScoreHistoryArgs): Promise<MemberScoreHistoryItem[]> {
    const resolvedTarget = online
        ? await resolveTargetFromMemberStats(target, buildMemberKeyAliases(target))
        : target;
    const aliases = buildMemberKeyAliases(resolvedTarget);
    const aliasSet = new Set(aliases);
    const normalizedTargetName = normalizeMemberName(resolvedTarget.memberName || '');
    if (aliases.length === 0 && !resolvedTarget.memberUserId && !(resolvedTarget.teamId && normalizedTargetName)) return [];

    const rawEntries = new Map<string, ScoreDocLike & { pending: boolean }>();
    const targetStageId = asTrimmedString(resolvedTarget.stageId) ?? stageId;
    const hasDirectIdentity = Boolean(
        asTrimmedString(resolvedTarget.memberUserId) ||
        asTrimmedString(resolvedTarget.memberKey)
    );
    const hasStrongIdentity = Boolean(
        hasDirectIdentity ||
        (asTrimmedString(resolvedTarget.teamId) && normalizedTargetName)
    );

    if (online) {
        const lookups: Promise<Awaited<ReturnType<typeof getDocs>>>[] = aliases.map((alias) =>
            getDocs(query(collection(db, 'scores'), where('memberKey', '==', alias)))
        );

        const memberUserId = asTrimmedString(resolvedTarget.memberUserId);
        if (memberUserId) {
            lookups.push(
                getDocs(query(collection(db, 'scores'), where('memberUserId', '==', memberUserId)))
            );
        }

        const teamId = asTrimmedString(resolvedTarget.teamId);
        if (!hasDirectIdentity && teamId && normalizedTargetName) {
            lookups.push(
                getDocs(query(collection(db, 'scores'), where('teamId', '==', teamId)))
            );
        }

        const snapshots = await Promise.allSettled(lookups);

        snapshots.forEach((result) => {
            if (result.status !== 'fulfilled') {
                if (!isPermissionDeniedError(result.reason)) {
                    console.warn('Member history score lookup failed:', result.reason);
                }
                return;
            }

            result.value.forEach((entry) => {
                const score = entry.data() as ScoreDocLike;
                if (!matchesTargetScore(score, resolvedTarget, aliasSet, normalizedTargetName)) return;
                if (!rawEntries.has(entry.id)) rawEntries.set(entry.id, { ...score, pending: false });
            });
        });
    }

    const pendingScores = await loadUnsyncedScoresSafely();
    pendingScores.forEach((score, index) => {
        if (!matchesTargetScore(score, resolvedTarget, aliasSet, normalizedTargetName)) return;
        rawEntries.set(`pending-${index}-${score.memberKey}`, { ...score, pending: true });
    });

    const stageFiltered = [...rawEntries.entries()].filter(([, score]) => {
        if (!isMemberScore(score)) return false;
        if (hasStrongIdentity) return true;
        if (!targetStageId) return true;

        const scoreStageId = asTrimmedString(score.stageId);
        if (!scoreStageId) return true;

        return scoreStageId === targetStageId;
    });

    const taskTitles = await toTaskTitleMap(
        stageFiltered
            .map(([, score]) => (typeof score.taskId === 'string' ? score.taskId : null))
            .filter((taskId): taskId is string => Boolean(taskId)),
        online
    );

    const history = stageFiltered
        .map(([id, score]) => toHistoryItem(id, score, taskTitles, score.pending))
        .filter((item): item is MemberScoreHistoryItem => item !== null);

    // ── Include team-level scores that have no individual member entries ──
    const teamId = asTrimmedString(resolvedTarget.teamId);
    if (online && teamId) {
        try {
            // Get current member count for per-member share calculation
            // Deduplicate member_stats entries: a person may have multiple keys
            // (e.g. u:userId AND m:teamId_name or n:teamId:name) for the same member
            const memberStatsSnap = await getDocs(
                query(collection(db, 'member_stats'), where('teamId', '==', teamId))
            );
            const uniqueMemberNames = new Set<string>();
            memberStatsSnap.forEach((entry) => {
                const data = entry.data();
                const name = typeof data.memberName === 'string' ? data.memberName.trim().toLowerCase() : '';
                if (name) uniqueMemberNames.add(name);
                else uniqueMemberNames.add(entry.id); // fallback to doc ID if no name
            });
            const memberCount = Math.max(1, uniqueMemberNames.size);

            // Fetch all scores for this team
            const teamScoreSnap = await getDocs(
                query(collection(db, 'scores'), where('teamId', '==', teamId))
            );

            // Build set of taskIds already covered by individual member scores
            const coveredTaskIds = new Set<string>();
            history.forEach(item => {
                if (item.taskId) coveredTaskIds.add(item.taskId);
            });

            // Also track which raw score doc IDs we already have as member scores
            const coveredDocIds = new Set<string>(
                stageFiltered.map(([id]) => id)
            );

            // Collect team scores that don't overlap with existing member scores
            const teamScores: Array<{ id: string; score: ScoreDocLike }> = [];
            const extraTaskIds: string[] = [];

            teamScoreSnap.forEach((entry) => {
                // Skip if we already have this exact document as a member score
                if (coveredDocIds.has(entry.id)) return;

                const score = entry.data() as ScoreDocLike;
                const targetType = asTrimmedString(score.targetType);

                // Skip explicit member scores — these are handled individually
                if (targetType === 'member') return;

                // For scores without targetType, skip if they have explicit
                // member identity (they belong to specific individual members)
                if (!targetType && hasExplicitMemberIdentity(score)) return;

                const scoreTaskId = typeof score.taskId === 'string' ? score.taskId : null;
                if (scoreTaskId && coveredTaskIds.has(scoreTaskId)) return;

                teamScores.push({ id: entry.id, score });
                if (scoreTaskId && !taskTitles.has(scoreTaskId)) extraTaskIds.push(scoreTaskId);
            });

            // Resolve missing task titles for team scores
            if (extraTaskIds.length > 0) {
                const extraTitles = await toTaskTitleMap(extraTaskIds, online);
                extraTitles.forEach((title, tid) => taskTitles.set(tid, title));
            }

            // Add team scores as per-member entries
            for (const { id, score } of teamScores) {
                const type = score.type === 'deduct' ? 'deduct' : 'earn';
                const fullPoints = Math.abs(Number(score.points || 0));
                const perMemberPoints = Number((fullPoints / memberCount).toFixed(2));
                if (perMemberPoints <= 0) continue;

                const scoreTaskId = typeof score.taskId === 'string' ? score.taskId : null;
                const title = (scoreTaskId ? taskTitles.get(scoreTaskId) : null)
                    || score.customNote || 'مهمة جماعية';

                history.push({
                    id: `team-${id}`,
                    taskId: scoreTaskId,
                    taskTitle: title,
                    points: perMemberPoints,
                    type,
                    actorName: typeof score.registeredByName === 'string' ? score.registeredByName : null,
                    customNote: typeof score.customNote === 'string' ? score.customNote : null,
                    stageId: typeof score.stageId === 'string' ? score.stageId : null,
                    timestamp: score.timestamp ?? null,
                    pending: false,
                });
            }
        } catch {
            // Silently ignore team score lookup failures
        }
    }

    return history
        .sort(sortByNewest)
        .slice(0, maxItems);
}
