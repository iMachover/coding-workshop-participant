/**
 * The ticket workflow is not a straight line:
 *
 *   Open -> In progress -> Resolved -> Closed      (main path)
 *                |  ^
 *                v  |
 *             Blocked                              (optional side state)
 *
 * Most tickets never become Blocked. When one does, work is paused at the
 * "In progress" stage and resumes there once the blocker is cleared.
 */

export const MAIN_PATH = ['open', 'in_progress', 'resolved', 'closed']

/** Where a Blocked ticket sits on the main path. */
const BLOCKED_AT = 'in_progress'

/**
 * Each main-path step's state, plus whether the Blocked side state is active.
 * @param {string} status the ticket's current status
 * @returns {{
 *   steps: Array<{status: string, state: 'done' | 'current' | 'paused' | 'upcoming'}>,
 *   blocked: boolean,
 * }}
 */
export function workflowState(status) {
  const blocked = status === 'blocked'
  const position = MAIN_PATH.indexOf(blocked ? BLOCKED_AT : status)

  const steps = MAIN_PATH.map((step, index) => {
    let state = 'upcoming'
    if (index < position) state = 'done'
    else if (index === position) state = blocked ? 'paused' : 'current'
    return { status: step, state }
  })

  return { steps, blocked }
}
