import { buildMemberKeyAliases, toCanonicalMemberKey } from './memberKeys';

const todayStr = () => new Date().toISOString().slice(0, 10);

export const isMassTaskTitle = (title: string) =>
    title.includes('قداس') || title.includes('قداسس');

export const attendanceCacheKey = (taskId: string) =>
    `attendance_${taskId}_${todayStr()}`;

export const loadAttendedKeys = (taskId: string): Set<string> => {
    try {
        const raw = localStorage.getItem(attendanceCacheKey(taskId));
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
};

export const saveAttendedKeys = (taskId: string, keys: Set<string>) => {
    try {
        localStorage.setItem(attendanceCacheKey(taskId), JSON.stringify([...keys]));
    } catch {
        // Ignore local storage failures.
    }
};

export const updateAttendanceCacheForMembers = (
    taskId: string,
    taskTitle: string,
    memberKeys: string[],
    scoreType: 'earn' | 'deduct'
) => {
    if (!taskId || memberKeys.length === 0 || !isMassTaskTitle(taskTitle)) return;

    const nextKeys = loadAttendedKeys(taskId);
    for (const memberKey of memberKeys) {
        const aliases = buildMemberKeyAliases({ memberKey });
        for (const alias of aliases) {
            nextKeys.delete(alias);
        }

        if (scoreType === 'earn') {
            const canonical = toCanonicalMemberKey({ memberKey }) ?? memberKey;
            nextKeys.add(canonical);
        }
    }
    saveAttendedKeys(taskId, nextKeys);
};
