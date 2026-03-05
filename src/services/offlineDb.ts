import Dexie, { type Table } from 'dexie';

export interface PendingScore {
    id?: number;
    teamId: string;
    taskId: string;
    points: number;
    type: 'earn' | 'deduct';
    targetType: 'team' | 'member';
    source?: 'team' | 'leader';
    registeredBy: string;
    stageId: string | null;
    memberKey?: string;
    memberUserId?: string | null;
    memberName?: string;
    applyToTeamTotal: boolean;
    timestamp: number;
    synced: boolean;
}

export interface CachedTeam {
    teamId: string;
    name: string;
    leaderId: string;
    totalPoints: number;
    memberCount: number;
    updatedAt: number;
}

export interface CachedTask {
    taskId: string;
    title: string;
    points: number;
    teamPoints?: number;
    type: 'team' | 'leader' | 'member' | string;
    status: 'active' | 'archived';
    stageId?: string;
    createdBy: string;
}

export interface CachedUser {
    userId: string;
    name: string;
    email: string;
    role: string;
    teamId: string | null;
}

class CompetitionDB extends Dexie {
    pendingScores!: Table<PendingScore>;
    cachedTeams!: Table<CachedTeam>;
    cachedTasks!: Table<CachedTask>;
    cachedUsers!: Table<CachedUser>;

    constructor() {
        super('CompetitionAppDB');
        this.version(1).stores({
            pendingScores: '++id, teamId, taskId, points, type, registeredBy, timestamp, synced',
            cachedTeams: 'teamId, name, leaderId, totalPoints, updatedAt',
            cachedTasks: 'taskId, title, points, type, status',
            cachedUsers: 'userId, name, email, role, teamId',
        });
        this.version(2).stores({
            pendingScores: '++id, teamId, taskId, points, type, source, registeredBy, stageId, timestamp, synced',
            cachedTeams: 'teamId, name, leaderId, totalPoints, updatedAt',
            cachedTasks: 'taskId, title, points, type, status',
            cachedUsers: 'userId, name, email, role, teamId',
        });
        this.version(3).stores({
            pendingScores: '++id, teamId, taskId, points, type, targetType, source, registeredBy, stageId, memberKey, memberUserId, applyToTeamTotal, timestamp, synced',
            cachedTeams: 'teamId, name, leaderId, totalPoints, updatedAt',
            cachedTasks: 'taskId, title, points, type, status',
            cachedUsers: 'userId, name, email, role, teamId',
        });
        this.version(4).stores({
            pendingScores: '++id, teamId, taskId, points, type, targetType, source, registeredBy, stageId, memberKey, memberUserId, applyToTeamTotal, timestamp, synced',
            cachedTeams: 'teamId, name, leaderId, totalPoints, updatedAt',
            cachedTasks: 'taskId, title, points, type, status, stageId',
            cachedUsers: 'userId, name, email, role, teamId',
        });
    }
}

export const localDb = new CompetitionDB();

// Add a pending score to queue
export async function addPendingScore(score: Omit<PendingScore, 'id' | 'synced'>) {
    return localDb.pendingScores.add({ ...score, synced: false });
}

// Get all unsynced scores
export async function getUnsyncedScores(): Promise<PendingScore[]> {
    return localDb.pendingScores.where('synced').equals(0).toArray();
}

// Mark a score as synced
export async function markScoreSynced(id: number) {
    return localDb.pendingScores.update(id, { synced: true });
}

// Cache teams locally
export async function cacheTeams(teams: CachedTeam[]) {
    await localDb.cachedTeams.clear();
    await localDb.cachedTeams.bulkAdd(teams);
}

// Get cached teams
export async function getCachedTeams(): Promise<CachedTeam[]> {
    return localDb.cachedTeams.toArray();
}

// Cache tasks locally
export async function cacheTasks(tasks: CachedTask[]) {
    await localDb.cachedTasks.clear();
    await localDb.cachedTasks.bulkAdd(tasks);
}

// Get cached tasks
export async function getCachedTasks(): Promise<CachedTask[]> {
    return localDb.cachedTasks.toArray();
}

// Get pending sync count
export async function getPendingSyncCount(): Promise<number> {
    return localDb.pendingScores.where('synced').equals(0).count();
}
