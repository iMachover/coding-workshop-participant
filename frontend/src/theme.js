import { createTheme } from '@mui/material/styles';

/**
 * ACME look from the assets/ mockups: deep teal on a soft green-grey ground,
 * tight sans-serif headings, monospace for codes and figures.
 */
export const SIDEBAR_WIDTH = 232;

export const monoFont = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const theme = createTheme({
  palette: {
    primary: { main: '#1f4d4f', dark: '#163a3c', light: '#3c6a6b', contrastText: '#ffffff' },
    success: { main: '#4f8a6e' },
    warning: { main: '#b7832a' },
    error: { main: '#b4493c' },
    background: { default: '#f6f7f4', paper: '#fbfcfa' },
    text: { primary: '#1b3634', secondary: '#5d6b68' },
    divider: '#dfe4de',
    sidebar: { main: '#eef1ed', active: '#dce6de' },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    overline: { fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.16em', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: '#dfe4de' } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
