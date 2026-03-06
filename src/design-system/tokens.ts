/**
 * Design System Tokens — Single source of truth for all visual values.
 *
 * These values mirror the @theme block in index.css and the stage config.
 * Always reference these tokens when adding new components or styles.
 */

export const tokens = {
    // ── COLORS ──
    colors: {
        // Brand
        primary: '#6366f1',
        primaryLight: '#818cf8',
        primaryDark: '#4f46e5',
        accent: '#f59e0b',
        accentLight: '#fbbf24',

        // Stages (kept in sync with config/stages.ts)
        grade7: '#6c63ff',
        grade8: '#00d4aa',
        grade9: '#ff6b9d',

        // Semantic
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',

        // Neutral surface
        bg: '#0f0e2a',
        bgLight: '#161438',
        surface: '#1e1b4b',
        surfaceLight: '#312e81',
        surfaceCard: '#252250',
        glass: 'rgba(99, 102, 241, 0.08)',
        glassBorder: 'rgba(99, 102, 241, 0.15)',

        // Border
        border: '#334155',

        // Text
        textPrimary: '#f1f5f9',
        textSecondary: '#94a3b8',
        textMuted: '#64748b',
    },

    // ── TYPOGRAPHY ──
    typography: {
        fontFamily: {
            cairo: "'Cairo', 'Inter', ui-sans-serif, system-ui, sans-serif",
            sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
        },
        sizes: {
            xs: '0.75rem',    // 12px
            sm: '0.875rem',   // 14px
            base: '1rem',     // 16px
            lg: '1.125rem',   // 18px
            xl: '1.25rem',    // 20px
            '2xl': '1.5rem',  // 24px
            '3xl': '1.875rem',// 30px
            '4xl': '2.25rem', // 36px
        },
        weights: {
            normal: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
            extrabold: 800,
            black: 900,
        },
    },

    // ── SPACING ──
    spacing: {
        xs: '0.25rem',  // 4px
        sm: '0.5rem',   // 8px
        md: '1rem',     // 16px
        lg: '1.5rem',   // 24px
        xl: '2rem',     // 32px
        '2xl': '3rem',  // 48px
    },

    // ── BORDER RADIUS ──
    radius: {
        sm: '0.5rem',     // 8px
        md: '0.75rem',    // 12px
        lg: '0.875rem',   // 14px — used by btn, input
        xl: '1rem',       // 16px
        '2xl': '1.25rem', // 20px — used by glass-card
        '3xl': '1.5rem',  // 24px
        full: '9999px',
    },

    // ── SHADOWS ──
    shadows: {
        sm: '0 1px 3px rgba(0,0,0,0.3)',
        md: '0 4px 16px rgba(0,0,0,0.4)',
        lg: '0 8px 32px rgba(0,0,0,0.3)',
        glassCard: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        btnPrimary: '0 4px 15px rgba(99, 102, 241, 0.3)',
        btnAccent: '0 4px 15px rgba(245, 158, 11, 0.3)',
        btnDanger: '0 4px 15px rgba(239, 68, 68, 0.3)',
        glow: (color: string) => `0 0 20px ${color}40`,
    },

    // ── TRANSITIONS ──
    transitions: {
        fast: '150ms ease',
        normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
        slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    },

    // ── BREAKPOINTS ──
    breakpoints: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
    },

    // ── Z-INDEX ──
    zIndex: {
        base: 0,
        raised: 10,
        dropdown: 20,
        sticky: 40,
        modal: 50,
        toast: 100,
        onlineBar: 9999,
    },
} as const;

export type Tokens = typeof tokens;
