import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * Tema Mantine mapată pe design tokens (tokens.css).
 * Nicio valoare vizuală nouă aici — doar puntea spre componentele Mantine.
 */

/* Accent Tonik (--accent #2e9e7e); indexul 6 este culoarea principală. */
const tonikAccent: MantineColorsTuple = [
  '#e6f4ef', // 0 — --accent-soft
  '#d2ece2',
  '#a8dbc9',
  '#7cc9ae',
  '#57ba98',
  '#3fae8a',
  '#2e9e7e', // 6 — --accent
  '#268a6d', // 7 — --accent-hover
  '#1d735a',
  '#135c47',
];

/* Neutre pe verdele foarte stins din tokeni. */
const tonikGray: MantineColorsTuple = [
  '#f7f8f7', // 0 — --bg-app
  '#f1f3f2', // 1 — --bg-subtle
  '#e3e7e5', // 2 — --border
  '#cbd2cf', // 3 — --border-strong
  '#a8b2ad',
  '#8a9791', // 5 — --text-faint
  '#5c6b64', // 6 — --text-muted
  '#3a4a42',
  '#12201a', // 8 — --text
  '#0e1b16', // 9 — --bg-sidebar
];

export const theme = createTheme({
  primaryColor: 'tonik',
  primaryShade: 6,
  colors: {
    tonik: tonikAccent,
    gray: tonikGray,
  },
  fontFamily: 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif',
  fontSizes: {
    xs: rem(10.5), // --fs-micro
    sm: rem(12), // --fs-small
    md: rem(13.5), // --fs-body
    lg: rem(15), // --fs-section
    xl: rem(20), // --fs-page-title
  },
  lineHeights: {
    md: '1.48', // ~20px la 13.5px
  },
  headings: {
    fontFamily: 'Inter, -apple-system, "Segoe UI", system-ui, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: rem(20), lineHeight: '1.4' }, // titlu de pagină (--fs-page-title)
      h2: { fontSize: rem(20), lineHeight: '1.4' },
      h3: { fontSize: rem(15), lineHeight: '1.4' }, // titlu de secțiune/card
      h4: { fontSize: rem(13.5), lineHeight: '1.45' },
    },
  },
  defaultRadius: 'md',
  radius: {
    sm: rem(5), // --radius-sm
    md: rem(8), // --radius-md
    lg: rem(10), // --radius-lg
    xl: rem(12),
  },
  shadows: {
    xs: 'var(--shadow-sm)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-pop)',
    xl: 'var(--shadow-pop)',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md', size: 'sm' },
      styles: {
        root: {
          fontWeight: 550,
          height: rem(32),
          paddingLeft: rem(12),
          paddingRight: rem(12),
          transition: 'background-color 140ms ease',
        },
      },
    },
    ActionIcon: {
      defaultProps: { radius: 'md' },
    },
    TextInput: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    PasswordInput: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    NumberInput: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    Select: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    MultiSelect: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    Textarea: {
      defaultProps: { size: 'sm' },
      styles: {
        label: { fontWeight: 550, marginBottom: rem(4), fontSize: 'var(--fs-small)' },
      },
    },
    Modal: {
      defaultProps: { radius: 'lg', overlayProps: { backgroundOpacity: 0.4, blur: 2 } },
      styles: {
        title: { fontWeight: 600, fontSize: 'var(--fs-section)' },
      },
    },
    Card: {
      defaultProps: { radius: 'lg', shadow: 'sm', withBorder: true },
    },
    Badge: {
      styles: { root: { textTransform: 'none', fontWeight: 550 } },
    },
    Table: {
      styles: {
        th: {
          fontWeight: 600,
          whiteSpace: 'nowrap',
          fontSize: 'var(--fs-small)',
          color: 'var(--text-muted)',
        },
      },
    },
    Notification: {
      defaultProps: { radius: 'md' },
    },
    SegmentedControl: {
      defaultProps: { size: 'sm', radius: 'md' },
    },
  },
});
