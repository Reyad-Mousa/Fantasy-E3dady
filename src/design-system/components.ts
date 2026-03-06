/**
 * Design System Component Recipes — Reusable className constants.
 *
 * Instead of repeating long Tailwind class strings across components,
 * import `ds` and use `ds.card`, `ds.btn.primary`, etc.
 *
 * These reference the CSS classes defined in index.css (glass-card, btn, etc.)
 * to keep visual consistency while centralising the strings.
 */

export const ds = {
    // ── CARDS ──
    card: 'glass-card rounded-[1.25rem] border border-glass-border',
    cardHover: 'glass-card glass-card-hover rounded-[1.25rem] border border-glass-border',

    // ── BUTTONS ──
    btn: {
        base: 'btn',
        primary: 'btn btn-primary',
        accent: 'btn btn-accent',
        danger: 'btn btn-danger',
        ghost: 'btn btn-ghost',
        icon: 'p-2 rounded-xl hover:bg-surface/50 transition-colors text-text-muted hover:text-text-primary',
    },

    // ── INPUTS ──
    input: 'input-field',
    select: 'select-field',

    // ── BADGES ──
    badge: {
        base: 'badge',
        pending: 'badge badge-pending',
        completed: 'badge badge-completed',
        failed: 'badge badge-failed',
        sync: 'badge badge-sync',
    },

    // ── MODALS ──
    backdrop: 'modal-backdrop',
    modal: 'glass-card p-6 max-w-sm w-full animate-slide-up',
    modalLg: 'glass-card p-0 max-w-md w-full overflow-hidden',
    modalXl: 'glass-card p-0 max-w-lg w-full overflow-hidden',

    // ── LAYOUT ──
    page: 'space-y-4 sm:space-y-6',
    section: 'space-y-3',
    grid: {
        '1col': 'grid grid-cols-1 gap-3 sm:gap-4',
        '2col': 'grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4',
        '3col': 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4',
    },
    container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',

    // ── TEXT ──
    text: {
        heading: 'text-xl sm:text-2xl font-black text-text-primary',
        subheading: 'text-lg font-bold text-text-primary',
        label: 'text-xs font-bold text-text-secondary',
        body: 'text-sm text-text-primary',
        muted: 'text-sm text-text-muted',
        truncate: 'truncate min-w-0',
    },

    // ── DIVIDERS ──
    divider: 'border-t border-border/30',
    dividerVertical: 'h-px bg-border/30',

    // ── EMPTY STATE ──
    emptyState: 'text-center py-16 px-4',

    // ── LOADING ──
    spinner: 'spinner',
    spinnerSm: 'spinner w-4 h-4',
    spinnerLg: 'spinner w-12 h-12',

    // ── GRADIENTS ──
    gradient: {
        primary: 'gradient-primary',
        accent: 'gradient-accent',
        success: 'gradient-success',
        danger: 'gradient-danger',
        surface: 'gradient-surface',
    },

    // ── GLOW ──
    glow: {
        primary: 'glow-primary',
        accent: 'glow-accent',
        success: 'glow-success',
    },

    // ── ANIMATIONS ──
    animate: {
        slideUp: 'animate-slide-up',
        float: 'animate-float',
        shimmer: 'animate-shimmer',
        pulseGlow: 'animate-pulse-glow',
        rankChange: 'animate-rank-change',
    },

    // ── DATA TABLE ──
    table: 'data-table',

    // ── ONLINE INDICATOR ──
    onlineIndicator: {
        base: 'online-indicator',
        online: 'online-indicator online',
        offline: 'online-indicator offline',
    },

    // ── TOAST ──
    toast: {
        base: 'toast',
        success: 'toast toast-success',
        error: 'toast toast-error',
        warning: 'toast toast-warning',
    },

    // ── TABS ──
    tab: {
        active: 'tab-active',
        inactive: 'tab-inactive',
    },

    // ── SKELETON ──
    skeleton: 'skeleton',

    // ── RANK MEDALS ──
    rank: {
        1: 'rank-1',
        2: 'rank-2',
        3: 'rank-3',
    },
} as const;

export type DesignSystem = typeof ds;
