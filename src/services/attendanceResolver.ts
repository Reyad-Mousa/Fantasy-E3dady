import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { getUnsyncedScores, type PendingScore } from './offlineDb';
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

interface ScoreLike {
    taskId?: string | null;
    targetType?: string | null;
    type?: 'earn' | 'deduct' | string;
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
    if (score.taskId !== taskId) return;
    if ((score.targetType ?? 'team') !== 'member') return;

    const canonicalKey = resolveCanonicalKey(score, aliasMap);
    if (!canonicalKey) return;

    const delta = score.type === 'deduct' ? -1 : 1;
    counters.set(canonicalKey, (counters.get(canonicalKey) ?? 0) + delta);
};

export const resolveTodayAttendance = async ({
    taskId,
    members,
    online,
    stageId = null,
}: ResolveTodayAttendanceArgs): Promise<Set<string>> => {
    if (!taskId || members.length === 0) return new Set();

    const aliasMap = buildAliasMap(members);
    const counters = new Map<string, number>();

    if (online) {
        const { start, end } = resolveTodayWindow();
        const constraints = [
            where('timestamp', '>=', start),
            where('timestamp', '<', end),
        ];
        if (stageId) {
            constraints.push(where('stageId', '==', stageId));
        }
        const snapshot = await getDocs(query(collection(db, 'scores'), ...constraints));
        snapshot.forEach((entry) => {
            applyScoreDelta(entry.data() as ScoreLike, taskId, aliasMap, counters);
        });
    } else {
        const cached = loadAttendedKeys(taskId);
        for (const rawKey of cached) {
            const canonicalKey = resolveCanonicalKey({ memberKey: rawKey }, aliasMap);
            if (!canonicalKey) continue;
            counters.set(canonicalKey, Math.max(1, counters.get(canonicalKey) ?? 0));
        }
    }

    const pendingScores = await getUnsyncedScores();
    for (const score of pendingScores) {
        const scoreLike = score as PendingScore & ScoreLike;
        if (stageId && scoreLike.stageId && scoreLike.stageId !== stageId) continue;
        applyScoreDelta(scoreLike, taskId, aliasMap, counters);
    }

    const result = new Set<string>();
    counters.forEach((net, key) => {
        if (net > 0) result.add(key);
    });
    return result;
};
