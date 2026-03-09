import { useState, useEffect, useMemo } from 'react';
import {
    collection, onSnapshot, query, doc, updateDoc, addDoc,
    serverTimestamp, increment, setDoc, where
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { canRegisterScores } from '@/context/AuthContext';
import {
    addPendingScore, getCachedTeams, getCachedUsers,
    cacheTeams, cacheUsers
} from '@/services/offlineDb';
import { logActivity } from '@/services/activityLogger';
import { saveAttendedKeys } from '@/services/attendanceCache';
import {
    resolveTodayAttendance,
    subscribeTodayAttendance,
} from '@/services/attendanceResolver';
import { buildMemberKey, normalizeMemberName } from '@/services/memberKeys';
import { isPermissionDeniedError } from '@/utils/helpers';
import { Task } from '@/components/TaskCard';
import { AttendanceMember } from '@/components/TaskAttendanceModal';
import { FilterValue } from '@/components/StageFilterBar';

interface UseTasksAttendanceProps {
    user: any;
    online: boolean;
    tasks: Task[];
    attendanceStageFilter: FilterValue;
    showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface Team {
    id: string;
    name: string;
    stageId: string | null;
    members: string[];
    totalPoints: number;
}

interface MemberUser {
    id: string;
    name: string;
    role: string;
    teamId: string | null;
    stageId?: string | null;
}

export function useTasksAttendance({
    user,
    online,
    tasks,
    attendanceStageFilter,
    showToast
}: UseTasksAttendanceProps) {
    const [attendanceTask, setAttendanceTask] = useState<Task | null>(null);
    const [addingKey, setAddingKey] = useState<string | null>(null);
    const [resolvedAddedKeys, setResolvedAddedKeys] = useState<Set<string>>(new Set());
    const [teams, setTeams] = useState<Team[]>([]);
    const [memberUsers, setMemberUsers] = useState<MemberUser[]>([]);

    // Fetch teams + members for attendance modal
    useEffect(() => {
        if (!user) return;
        const stageScopedRole = user.role === 'admin' || user.role === 'leader';
        if (!online) {
            Promise.all([getCachedTeams(), getCachedUsers()])
                .then(([cachedTeams, cachedUsers]) => {
                    const offlineTeams = cachedTeams
                        .map(team => ({
                            id: team.teamId,
                            name: team.name,
                            stageId: team.stageId || null,
                            members: team.members || [],
                            totalPoints: team.totalPoints || 0,
                        } as Team))
                        .filter(team => !stageScopedRole || !user.stageId || team.stageId === user.stageId);

                    const offlineMembers = cachedUsers
                        .map(member => ({
                            id: member.userId,
                            name: member.name,
                            role: member.role,
                            teamId: member.teamId,
                            stageId: member.stageId || null,
                        } as MemberUser))
                        .filter(member => member.role === 'member');

                    setTeams(offlineTeams);
                    setMemberUsers(offlineMembers);
                })
                .catch(err => {
                    console.error('Offline attendance cache:', err);
                    setTeams([]);
                    setMemberUsers([]);
                });

            return;
        }

        const stageFilter = stageScopedRole && user.stageId
            ? where('stageId', '==', user.stageId) : null;

        const teamsQ = stageFilter
            ? query(collection(db, 'teams'), stageFilter)
            : collection(db, 'teams');

        const u1 = onSnapshot(
            teamsQ,
            snap => {
                const nextTeams = snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
                setTeams(nextTeams);
                cacheTeams(nextTeams.map(team => ({
                    teamId: team.id,
                    name: team.name,
                    leaderId: '',
                    totalPoints: team.totalPoints || 0,
                    memberCount: team.members?.length || 0,
                    members: team.members || [],
                    stageId: team.stageId || null,
                    updatedAt: Date.now(),
                }))).catch(console.error);
            },
            err => console.error('Teams:', err)
        );

        const u2 = onSnapshot(
            collection(db, 'users'),
            snap => {
                const nextMembers = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as MemberUser))
                    .filter(u => u.role === 'member');
                setMemberUsers(nextMembers);
                cacheUsers(nextMembers.map(member => ({
                    userId: member.id,
                    name: member.name,
                    email: '',
                    role: member.role,
                    teamId: member.teamId,
                    stageId: member.stageId || null,
                }))).catch(console.error);
            },
            () => setMemberUsers([])
        );

        return () => { u1(); u2(); };
    }, [online, user]);

    // Build flat member list scoped to the logged-in user's stage
    const attendanceMembers = useMemo<AttendanceMember[]>(() => {
        const stageScopedRole = user?.role === 'admin' || user?.role === 'leader';
        const myStageId = user?.stageId || null;
        const activeStageFilter = user?.role === 'super_admin' ? attendanceStageFilter : myStageId;

        const scopedTeams = teams.filter(team => {
            if (stageScopedRole && myStageId) return team.stageId === myStageId;
            if (activeStageFilter && activeStageFilter !== 'all') return team.stageId === activeStageFilter;
            return true;
        });

        const teamMap = new Map(scopedTeams.map(t => [t.id, t]));
        const result: AttendanceMember[] = [];
        const seenKeys = new Set<string>();

        // Users with role=member belonging to scoped teams
        for (const m of memberUsers) {
            if (!m.teamId || !teamMap.has(m.teamId)) continue;
            const name = (m.name || '').trim();
            if (!name) continue;
            const team = teamMap.get(m.teamId)!;
            const key = buildMemberKey({
                memberUserId: m.id,
                teamId: m.teamId,
                memberName: name,
            });
            if (!key) continue;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            result.push({
                key,
                userId: m.id,
                name,
                teamId: m.teamId,
                teamName: team.name,
                stageId: m.stageId || team.stageId || null,
            });
        }

        // Also include names listed in team.members array (legacy)
        for (const team of scopedTeams) {
            for (const rawName of (team.members || [])) {
                const name = String(rawName || '').trim();
                if (!name) continue;
                const normName = normalizeMemberName(name);
                // skip if already added from users
                const alreadyUser = result.some(
                    r => r.teamId === team.id && normalizeMemberName(r.name) === normName
                );
                if (alreadyUser) continue;
                const key = buildMemberKey({ teamId: team.id, memberName: name });
                if (!key || seenKeys.has(key)) continue;
                seenKeys.add(key);
                result.push({
                    key,
                    userId: null,
                    name,
                    teamId: team.id,
                    teamName: team.name,
                    stageId: team.stageId || null,
                });
            }
        }

        // Sort alphabetically by member name
        return result.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [attendanceStageFilter, teams, memberUsers, user]);

    useEffect(() => {
        if (!attendanceTask) {
            setResolvedAddedKeys(new Set());
            return;
        }

        const selectedStageId = user?.role === 'super_admin'
            ? (attendanceStageFilter === 'all' ? null : attendanceStageFilter)
            : (user?.stageId || null);
        let cancelled = false;

        if (online) {
            const unsubscribe = subscribeTodayAttendance({
                taskId: attendanceTask.id,
                members: attendanceMembers,
                stageId: selectedStageId,
                onResolved: (keys) => {
                    if (!cancelled) setResolvedAddedKeys(keys);
                },
                onError: (err) => {
                    console.error('Subscribe attendance failed:', err);
                    if (!cancelled) setResolvedAddedKeys(new Set());
                },
            });

            return () => {
                cancelled = true;
                unsubscribe();
            };
        }

        resolveTodayAttendance({
            taskId: attendanceTask.id,
            members: attendanceMembers,
            online,
            stageId: selectedStageId,
        }).then((keys) => {
            if (!cancelled) setResolvedAddedKeys(keys);
        }).catch((err) => {
            console.error('Resolve attendance failed:', err);
            if (!cancelled) setResolvedAddedKeys(new Set());
        });

        return () => { cancelled = true; };
    }, [attendanceMembers, attendanceStageFilter, attendanceTask, online, user?.role, user?.stageId]);

    const visibleAddedCount = useMemo(
        () => attendanceMembers.filter(member => resolvedAddedKeys.has(member.key)).length,
        [attendanceMembers, resolvedAddedKeys]
    );

    const handleGivePoints = async (member: AttendanceMember) => {
        if (!attendanceTask || !user || !canRegisterScores(user.role)) return;
        if (addingKey) return; // prevent double-click
        const points = attendanceTask.points || 0;
        const teamBonus = attendanceTask.teamPoints || 0;
        if (points === 0 && teamBonus === 0) {
            showToast('هذه المهمة لا تحتوي على نقاط', 'warning');
            return;
        }

        setAddingKey(member.key);
        try {
            const stageId = member.stageId || user.stageId || null;
            const memberPayload = {
                teamId: member.teamId,
                taskId: attendanceTask.id,
                points,
                type: 'earn' as const,
                targetType: 'member' as const,
                source: 'team' as const,
                registeredBy: user.uid,
                registeredByName: user.name || null,
                stageId,
                memberKey: member.key,
                memberUserId: member.userId,
                memberName: member.name,
                applyToTeamTotal: true,
                customNote: null,
            };

            if (online) {
                // 1. Add score document (individual)
                await addDoc(collection(db, 'scores'), {
                    ...memberPayload,
                    pendingSync: false,
                    timestamp: serverTimestamp(),
                    syncedAt: serverTimestamp(),
                });
                // Log to activities
                logActivity({
                    kind: 'score',
                    teamId: member.teamId,
                    teamName: member.teamName,
                    taskId: attendanceTask.id,
                    taskTitle: attendanceTask.title,
                    points,
                    scoreType: 'earn',
                    targetType: 'member',
                    memberKey: member.key,
                    memberUserId: member.userId,
                    memberName: member.name,
                    stageId,
                    actorId: user.uid,
                    actorName: user.name,
                    actorRole: user.role,
                });

                // 2. Upsert member_stats
                try {
                    await setDoc(doc(db, 'member_stats', member.key), {
                        memberKey: member.key,
                        memberUserId: member.userId,
                        memberName: member.name,
                        teamId: member.teamId,
                        stageId,
                        totalPoints: increment(points),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } catch (err) {
                    if (isPermissionDeniedError(err)) {
                        throw {
                            scope: 'member_stats',
                            code: 'permission-denied',
                            original: err,
                        };
                    }
                    throw err;
                }

                // 3. Update team total with individual points
                await updateDoc(doc(db, 'teams', member.teamId), {
                    totalPoints: increment(points),
                });
            } else {
                await addPendingScore({
                    ...memberPayload,
                    timestamp: Date.now(),
                });
            }

            // 4. Build the new attendance set, persist to localStorage
            const newAddedKeys = new Set(resolvedAddedKeys).add(member.key);
            setResolvedAddedKeys(newAddedKeys);
            saveAttendedKeys(attendanceTask.id, newAddedKeys);

            // 5. Check if ALL members of this team are now attended
            const teamBonus = attendanceTask.teamPoints ?? 0;
            if (teamBonus > 0) {
                const teamMembers = attendanceMembers.filter(m => m.teamId === member.teamId);
                const allTeamDone = teamMembers.length > 0 &&
                    teamMembers.every(m => newAddedKeys.has(m.key));

                if (allTeamDone) {
                    const bonusTeamName = teams.find(t => t.id === member.teamId)?.name || '';
                    if (online) {
                        // Add teamPoints bonus to the team
                        await updateDoc(doc(db, 'teams', member.teamId), {
                            totalPoints: increment(teamBonus),
                        });
                        // Log bonus score doc (team-level)
                        await addDoc(collection(db, 'scores'), {
                            teamId: member.teamId,
                            taskId: attendanceTask.id,
                            points: teamBonus,
                            type: 'earn',
                            targetType: 'team',
                            source: 'team',
                            registeredBy: user.uid,
                            registeredByName: user.name,
                            stageId,
                            memberKey: null,
                            memberUserId: null,
                            memberName: null,
                            applyToTeamTotal: true,
                            customNote: 'مكافأة حضور كامل الفريق',
                            pendingSync: false,
                            timestamp: serverTimestamp(),
                            syncedAt: serverTimestamp(),
                        });
                        // Log bonus to activities
                        logActivity({
                            kind: 'score',
                            teamId: member.teamId,
                            teamName: bonusTeamName,
                            taskId: attendanceTask.id,
                            taskTitle: attendanceTask.title,
                            points: teamBonus,
                            scoreType: 'earn',
                            targetType: 'team',
                            customNote: 'مكافأة حضور كامل الفريق',
                            stageId,
                            actorId: user.uid,
                            actorName: user.name,
                            actorRole: user.role,
                        });

                        // Distribute team bonus evenly to each member's stats
                        const perMemberShare = teamBonus / teamMembers.length;
                        await Promise.allSettled(
                            teamMembers.map(async (tm) => {
                                const tmStageId = tm.stageId || user.stageId || null;
                                // Individual score record (applyToTeamTotal: false to avoid double-counting)
                                await addDoc(collection(db, 'scores'), {
                                    teamId: tm.teamId,
                                    taskId: attendanceTask.id,
                                    points: perMemberShare,
                                    type: 'earn',
                                    targetType: 'member',
                                    source: 'team',
                                    registeredBy: user.uid,
                                    registeredByName: user.name,
                                    stageId: tmStageId,
                                    memberKey: tm.key,
                                    memberUserId: tm.userId,
                                    memberName: tm.name,
                                    applyToTeamTotal: false,
                                    customNote: 'حصة من مكافأة حضور كامل الفريق',
                                    pendingSync: false,
                                    timestamp: serverTimestamp(),
                                    syncedAt: serverTimestamp(),
                                });
                                // Update member_stats
                                await setDoc(doc(db, 'member_stats', tm.key), {
                                    memberKey: tm.key,
                                    memberUserId: tm.userId,
                                    memberName: tm.name,
                                    teamId: tm.teamId,
                                    stageId: tmStageId,
                                    totalPoints: increment(perMemberShare),
                                    updatedAt: serverTimestamp(),
                                }, { merge: true });
                            })
                        );

                        const roundedShare = Math.round(perMemberShare);
                        showToast(`🎉 كل فريق "${bonusTeamName}" حضر! +${teamBonus} نقطة (${roundedShare} لكل فرد)`, 'success');
                    } else {
                        await addPendingScore({
                            teamId: member.teamId,
                            taskId: attendanceTask.id,
                            points: teamBonus,
                            type: 'earn',
                            targetType: 'team',
                            source: 'team',
                            registeredBy: user.uid,
                            registeredByName: user.name || null,
                            stageId,
                            memberKey: null,
                            memberUserId: null,
                            memberName: null,
                            customNote: 'مكافأة حضور كامل الفريق',
                            distributeToMembers: false,
                            applyToTeamTotal: true,
                            timestamp: Date.now(),
                        });
                        showToast(`✅ تم الحفظ محليًا: ${member.name} + مكافأة فريق "${bonusTeamName}". ستتم المزامنة عند عودة الإنترنت`, 'warning');
                    }
                    return; // toast already shown
                }
            }

            if (online) {
                if (points > 0) {
                    showToast(`✅ تم إضافة ${points} نقطة لـ ${member.name}`);
                } else {
                    showToast(`✅ تم تسجيل حضور ${member.name}`);
                }
            } else {
                showToast(`✅ تم حفظ ${member.name} محليًا وسيتم التزامن عند عودة الإنترنت`, 'warning');
            }
        } catch (err) {
            const scopedError = err as { scope?: string; code?: string; original?: unknown };
            if (scopedError.scope === 'member_stats' && scopedError.code === 'permission-denied') {
                console.error(scopedError.original ?? err);
                showToast('تعذّر تحديث نقاط الفرد بسبب صلاحيات/مرحلة member_stats. يُرجى إصلاح بيانات member_stats أولًا', 'error');
            } else {
                console.error(err);
                showToast('فشل في إضافة النقاط', 'error');
            }
        } finally {
            setAddingKey(null);
        }
    };

    return {
        attendanceTask,
        setAttendanceTask,
        addingKey,
        resolvedAddedKeys,
        setResolvedAddedKeys,
        attendanceMembers,
        visibleAddedCount,
        handleGivePoints
    };
}
