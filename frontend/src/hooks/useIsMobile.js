import { useMediaQuery } from 'react-responsive'

/** Phone-sized screens, matching MUI's "sm" breakpoint (600px). */
export const MOBILE_MAX_WIDTH = 599

/**
 * True on phone-sized screens.
 * @returns {boolean}
 */
export default function useIsMobile() {
  return useMediaQuery({ maxWidth: MOBILE_MAX_WIDTH })
}
