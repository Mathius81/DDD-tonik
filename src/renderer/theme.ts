import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '600' },
});

/** Culori semantice pentru statusuri — folosite împreună cu text/iconițe, nu singure. */
export const statusColors = {
  overdue: 'red',
  soon: 'orange',
  upcoming: 'yellow',
  scheduled: 'green',
  inactive: 'gray',
} as const;
