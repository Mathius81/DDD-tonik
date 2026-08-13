import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * Design system Tonik
 * — accent teal modern, neutre calde, radii generoase, umbre discrete.
 * Tokens folosite consecvent în toată aplicația.
 */

/** Teal Tonik — accentul de brand. Indexul 6 este culoarea principală. */
const tonikTeal: MantineColorsTuple = [
  '#e6faf7', // 0 — mint foarte discret (fundal accent)
  '#d0f2ec', // 1
  '#a3e4d9', // 2
  '#72d5c4', // 3
  '#4cc8b3', // 4
  '#35c0a8', // 5
  '#14b8a0', // 6 — primary
  '#0ea38d', // 7 — hover
  '#008573', // 8
  '#00695a', // 9
];

/** Neutre calde pentru fundal, borduri și text secundar. */
const tonikGray: MantineColorsTuple = [
  '#f8fafa', // 0 — fundal aplicație
  '#f1f4f4', // 1 — fundal secundar
  '#e4e9e9', // 2 — borduri
  '#d3dada', // 3
  '#b0bbbb', // 4
  '#8a9797', // 5 — text auxiliar
  '#5f6c6c', // 6 — text secundar
  '#414d4d', // 7
  '#2a3434', // 8 — text principal
  '#1a2222', // 9 — charcoal
];

export const theme = createTheme({
  primaryColor: 'tonik',
  primaryShade: 6,
  colors: {
    tonik: tonikTeal,
    gray: tonikGray,
  },
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: '650',
    sizes: {
      h1: { fontSize: rem(30), lineHeight: '1.25' },
      h2: { fontSize: rem(24), lineHeight: '1.3' },
      h3: { fontSize: rem(19), lineHeight: '1.35' },
      h4: { fontSize: rem(16), lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  radius: {
    xs: rem(6),
    sm: rem(8),
    md: rem(10),
    lg: rem(14),
    xl: rem(20),
  },
  shadows: {
    xs: '0 1px 2px rgba(26, 34, 34, 0.04)',
    sm: '0 1px 3px rgba(26, 34, 34, 0.05), 0 1px 2px rgba(26, 34, 34, 0.04)',
    md: '0 4px 12px rgba(26, 34, 34, 0.06), 0 1px 3px rgba(26, 34, 34, 0.04)',
    lg: '0 12px 28px rgba(26, 34, 34, 0.10), 0 4px 10px rgba(26, 34, 34, 0.05)',
    xl: '0 24px 48px rgba(26, 34, 34, 0.14)',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
      styles: {
        root: { fontWeight: 550, transition: 'background-color 120ms ease, transform 80ms ease' },
      },
    },
    TextInput: {
      styles: {
        label: { fontWeight: 550, marginBottom: rem(6) },
        input: { transition: 'border-color 120ms ease, box-shadow 120ms ease' },
      },
    },
    PasswordInput: {
      styles: { label: { fontWeight: 550, marginBottom: rem(6) } },
    },
    NumberInput: {
      styles: { label: { fontWeight: 550, marginBottom: rem(6) } },
    },
    Select: {
      styles: { label: { fontWeight: 550, marginBottom: rem(6) } },
    },
    MultiSelect: {
      styles: { label: { fontWeight: 550, marginBottom: rem(6) } },
    },
    Textarea: {
      styles: { label: { fontWeight: 550, marginBottom: rem(6) } },
    },
    Modal: {
      defaultProps: { radius: 'lg', overlayProps: { backgroundOpacity: 0.45, blur: 3 } },
      styles: {
        title: { fontWeight: 650, fontSize: rem(18) },
        header: { paddingBottom: rem(4) },
      },
    },
    Card: {
      defaultProps: { radius: 'lg' },
    },
    Badge: {
      styles: { root: { textTransform: 'none', fontWeight: 550 } },
    },
    Tabs: {
      styles: {
        tab: { fontWeight: 550 },
      },
    },
    Table: {
      styles: {
        th: { fontWeight: 600, whiteSpace: 'nowrap' },
      },
    },
    Notification: {
      defaultProps: { radius: 'md' },
    },
  },
});

/** Culori semantice pentru statusuri — folosite împreună cu text/iconițe, nu singure. */
export const statusColors = {
  overdue: 'red',
  soon: 'orange',
  upcoming: 'yellow',
  scheduled: 'teal',
  inactive: 'gray',
} as const;
