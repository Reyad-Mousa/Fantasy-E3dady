import {
    collection,
    getDocs,
    onSnapshot,
    query,
    where,
    type QueryDocumentSnapshot,
    type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { loadAttendedKeys } from './attendanceCache';
import { buildMemberKeyAliases } from './memberKeys';

export interface AttendanceMemberRef {
    key: string;
    userId: string | null;
    name: string;
    teamId: string;
}

interface ResolveTodayAttendanceArgs {
    taskId: string;
    members: AttendanceMemberRef[];
    online: boolean;
    stageId?: string | null;
}

interface SubscribeTodayAttendanceArgs {
    taskId: string;
    members: AttendanceMemberRef[];
    stageId?: string | null;
    onResolved: (keys: Set<string>) => void;
    onError?: (error: unknown) => void;
}

interface ScoreLike {
    kind?: string | null;
    taskId?: string | null;
    targetType?: string | null;
    type?: 'earn' | 'deduct' | string;
    scoreType?: 'earn' | 'deduct' | string;
    memberKey?: string | null;
    memberUserId?: string | null;
    memberName?: string | null;
    teamId?: string | null;
    stageId?: string | null;
}

const resolveTodayWindow = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
};

const buildTodayConstraints = () => {
    const { start, end } = resolveTodayWindow();
    return [
        where('timestamp', '>=', start),
        where('timestamp', '<', end),
    ];
};

const buildAliasMap = (members: AttendanceMemberRef[]) => {
    const map = new Map<string, string>();
    for (const member of members) {
        const aliases = buildMemberKeyAliases({
            memberKey: member.key,
            memberUserId: member.userId,
            memberName: member.name,
            teamId: member.teamId,
        });
        for (const alias of aliases) {
            map.set(alias, member.key);
        }
    }
    return map;
};

const resolveCanonicalKey = (score: ScoreLike, aliasMap: Map<string, string>): string | null => {
    const aliases = buildMemberKeyAliases({
        memberKey: score.memberKey ?? null,
        memberUserId: score.memberUserId ?? null,
        memberName: score.memberName ?? null,
        teamId: score.teamId ?? null,
    });

    for (const alias of aliases) {
        const canonical = aliasMap.get(alias);
        if (canonical) return canonical;
    }
    return null;
};

const applyScoreDelta = (
    score: ScoreLike,
    taskId: string,
    aliasMap: Map<string, string>,
    counters: Map<string, number>
) => {
    if (score.kind && score.kind !== 'score') return;
    if (score.taskId !== taskId) return;
    if ((score.targetType ?? 'team') !== 'member') return;

    const canonicalKey = resolveCanonicalKey(score, aliasMap);
    if (!canonicalKey) return;

    const resolvedType = score.type === 'deduct' || score.scoreType === 'deduct'
        ? 'deduct'
        : 'earn';
    const delta = resolvedType === 'deduct' ? -1 : 1;
    counters.set(canonicalKey, (counters.get(canonicalKey) ?? 0) + delta);
};

const resolveAttendanceFromDocs = (
    docs: Array<QueryDocumentSnapshot<DocumentData>>,
    taskId: string,
    aliasMap: Map<string, string>
): Set<string> => {
    const counters = new Map<string, number>();
    for (const entry of docs) {
        applyScoreDelta(entry.data() as ScoreLike, taskId, aliasMap, counters);
    }

    const result = new Set<string>();
    counters.forEach((net, key) => {
        if (net > 0) result.add(key);
    });
    return result;
};

const getScoresFallbackSnapshot = async (stageId: string | null) => {
    const constraints = buildTodayConstraints();
    if (stageId) {
        constraints.push(where('stageId', '==', stageId));
    }
    return getDocs(query(collection(db, 'scores'), ...constraints));
};

export const resolveTodayAttendance = async ({
    taskId,
    members,
    online,
    stageId = null,
}: ResolveTodayAttendanceArgs): Promise<Set<string>> => {
    if (!taskId || members.length === 0) return new Set();

    const aliasMap = buildAliasMap(members);

    if (online) {
        try {
            const snapshot = await getDocs(query(collection(db, 'activities'), ...buildTodayConstraints()));
            return resolveAttendanceFromDocs(snapshot.docs, taskId, aliasMap);
        } catch (activityError) {
            try {
                const snapshot = await getScoresFallbackSnapshot(stageId);
                return resolveAttendanceFromDocs(snapshot.docs, taskId, aliasMap);
            } catch {
                throw activityError;
            }
        }
    } else {
        const counters = new Map<string, number>();
        const cached = loadAttendedKeys(taskId);
        for (const rawKey of cached) {
            const canonicalKey = resolveCanonicalKey({ memberKey: rawKey }, aliasMap);
            if (!canonicalKey) continue;
            counters.set(canonicalKey, Math.max(1, counters.get(canonicalKey) ?? 0));
        }

        const result = new Set<string>();
        counters.forEach((net, key) => {
            if (net > 0) result.add(key);
        });
        return result;
    }
};

export const subscribeTodayAttendance = ({
    taskId,
    members,
    stageId = null,
    onResolved,
    onError,
}: SubscribeTodayAttendanceArgs) => {
    if (!taskId || members.length === 0) {
        onResolved(new Set());
        return () => undefined;
    }

    const aliasMap = buildAliasMap(members);
    let fallbackUnsubscribe: (() => void) | null = null;

    const subscribeScoresFallback = () => {
        if (fallbackUnsubscribe) return;
        const constraints = buildTodayConstraints();
        if (stageId) {
            constraints.push(where('stageId', '==', stageId));
        }
        fallbackUnsubscribe = onSnapshot(
            query(collection(db, 'scores'), ...constraints),
            (snapshot) => {
                onResolved(resolveAttendanceFromDocs(snapshot.docs, taskId, aliasMap));
            },
            (error) => {
                if (onError) onError(error);
            }
        );
    };

    const unsubscribe = onSnapshot(
        query(collection(db, 'activities'), ...buildTodayConstraints()),
        (snapshot) => {
            onResolved(resolveAttendanceFromDocs(snapshot.docs, taskId, aliasMap));
        },
        (error) => {
            subscribeScoresFallback();
            if (onError) onError(error);
        }
    );

    return () => {
        unsubscribe();
        if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
};
