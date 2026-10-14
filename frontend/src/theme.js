import { createTheme } from '@mui/material/styles';

/**
 * ACME look, taken from the Replit prototype's `_group.css`
 * (assets/acme-react-handoff/src/components/mockups/acme/): deep teal on a pale
 * green-grey ground, DM Sans body, Manrope headings, IBM Plex Mono for codes and figures.
 */
export const SIDEBAR_WIDTH = 218;

export const monoFont = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const headingFont = '"Manrope", "DM Sans", sans-serif';

/** Raw colours from the prototype, for the few places a palette key doesn't fit. */
export const tokens = {
  ink: '#203d42',
  muted: '#617578',
  line: '#dce4df',
  lineSoft: '#e8ede5',
  paper: '#f5f6f1',
  panel: '#fdfef9',
  teal: '#20585a',
  tealDark: '#154346',
  mint: '#e6eee8',
  amber: '#88601c',
  amberBg: '#faf0d9',
  sidebar: '#eaf0e9',
  sidebarLine: '#d0dcd2',
  sidebarActive: '#d8e5d9',
  sidebarHover: '#e0eade',
  topbar: '#f8faf4',
  tableHead: '#f7f9f2',
  rowHover: '#f0f4e9',
  note: '#f3f6ed',
  focus: '#acba69',
  banner: '#214e50',
  inputLine: '#cbd7ce',
};

export const theme = createTheme({
  palette: {
    primary: { main: tokens.teal, dark: tokens.tealDark, light: '#3c6a6b', contrastText: '#f6fae9' },
    success: { main: '#508271' },
    warning: { main: '#be9451', dark: tokens.amber },
    error: { main: '#9c503c' },
    background: { default: tokens.paper, paper: tokens.panel },
    text: { primary: tokens.ink, secondary: tokens.muted },
    divider: tokens.line,
    sidebar: { main: tokens.sidebar, active: tokens.sidebarActive },
  },
  shape: { borderRadius: 5 },
  typography: {
    fontFamily: '"DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: 13,
    body1: { fontSize: 13, lineHeight: 1.45, letterSpacing: '-0.12px' },
    body2: { fontSize: 12, lineHeight: 1.45 },
    caption: { fontSize: 11, lineHeight: 1.4 },
    h1: { fontFamily: headingFont, fontSize: 26, fontWeight: 650, letterSpacing: '-1.2px', lineHeight: 1.2 },
    h2: { fontSize: 15, fontWeight: 650, lineHeight: 1.35 },
    h3: { fontSize: 14, fontWeight: 650, lineHeight: 1.35 },
    overline: { fontSize: 10, fontWeight: 700, letterSpacing: '1.6px', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600, fontSize: 12 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { letterSpacing: '-0.12px' },
        ':focus-visible': { outline: `3px solid ${tokens.focus}`, outlineOffset: 3 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: tokens.line, borderRadius: 7 } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, variant: 'outlined' },
      styleOverrides: {
        root: { borderRadius: 5, padding: '8px 13px', whiteSpace: 'nowrap', lineHeight: 1.35 },
        outlined: {
          borderColor: '#ccd8d1',
          backgroundColor: tokens.panel,
          color: tokens.ink,
          '&:hover': { backgroundColor: '#eaf0e8', borderColor: '#ccd8d1' },
        },
        contained: { '&:hover': { backgroundColor: tokens.tealDark } },
        sizeSmall: { fontSize: 11, padding: '5px 10px' },
        startIcon: { '& > *:nth-of-type(1)': { fontSize: 17 } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: tokens.lineSoft, fontSize: 12, padding: '10px 17px' },
        head: {
          fontSize: 10,
          fontWeight: 500,
          color: '#6b7d77',
          backgroundColor: tokens.tableHead,
          padding: '8px 17px',
          whiteSpace: 'nowrap',
          borderBottom: 0,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&.MuiTableRow-hover:hover': { backgroundColor: tokens.rowHover } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.panel,
          fontSize: 12,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.inputLine },
        },
        input: { padding: '10px 11px' },
        inputSizeSmall: { padding: '7px 10px', fontSize: 11 },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 12 } } },
    MuiFormHelperText: { styleOverrides: { root: { fontSize: 11, marginLeft: 0 } } },
    MuiMenuItem: { styleOverrides: { root: { fontSize: 12 } } },
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: '#e6ece3' } } },
    MuiAvatar: {
      styleOverrides: {
        root: {
          width: 30,
          height: 30,
          fontSize: 10,
          fontWeight: 700,
          backgroundColor: '#e6ece5',
          color: '#345a4e',
          border: '1px solid #d0dccf',
        },
      },
    },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: tokens.paper } } },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: '#183e435c', backdropFilter: 'blur(2px)' } } },
    },
  },
});
