/**
 * helpers.ts — Shared utility functions used across the application.
 *
 * Extracted here to avoid duplication in components and services.
 */

/**
 * Returns a trimmed non-empty string or null.
 */
export const asNonEmptyString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

/**
 * Safely converts a Firestore timestamp, epoch number, or ISO string to a Date.
 */
export function toEventDate(value: unknown): Date {
    if (!value) return new Date(0);
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }
    return new Date(0);
}

/**
 * Check if a Firebase error is a permission-denied error.
 */
export function isPermissionDeniedError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'permission-denied'
    );
}

/**
 * Returns a human-readable role label in Arabic.
 */
export function getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
        super_admin: 'مشرف عام',
        admin: 'مشرف',
        leader: 'قائد',
        member: 'عضو',
    };
    return labels[role] || role;
}

/**
 * Returns the badge color classes for a given role.
 */
export function getRoleBadgeColor(role: string): string {
    const colors: Record<string, string> = {
        super_admin: 'bg-accent/20 text-accent-light border-accent/30',
        admin: 'bg-primary/20 text-primary-light border-primary/30',
        leader: 'bg-success/20 text-success border-success/30',
        member: 'bg-text-muted/20 text-text-secondary border-text-muted/30',
    };
    return colors[role] || colors.member;
}

/**
 * Formats a points number for display (rounds to nearest integer).
 */
export function formatPoints(points: number): string {
    return String(Math.round(points));
}

/**
 * Rounds a points value to the nearest integer and normalizes invalid values to 0.
 */
export function roundPointsValue(points: number): number {
    return Number.isFinite(points) ? Math.round(points) : 0;
}
