/**
 * Shared look for the admin dashboard's panels (All tickets, Needs an engineer, Engineer
 * workload): white outlined flex columns that may shrink, so on large screens their
 * content scrolls inside them instead of growing the page.
 */
export const panelSx = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

/** The panels' 16px navy headings. */
export const panelHeadingSx = {
  m: 0,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.3,
  color: 'secondary.main',
}

/**
 * Hides a heading on screen but keeps it for screen readers, so a panel inside a phone
 * tab (whose tab already names it) is still a labelled region.
 */
export const visuallyHiddenSx = {
  position: 'absolute',
  // Strings, since in sx a bare 1 means 100% (width) or one spacing unit (margin).
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
