import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { E2E_DATABASE } from '../playwright.config.js'

const SQL_DIR = fileURLToPath(new URL('../../backend/core/sql/', import.meta.url))

/** Run psql against the e2e database only. Local Postgres, user test/test (see README). */
function psql(args) {
  if (!E2E_DATABASE.endsWith('_e2e')) {
    throw new Error(`Refusing to touch database "${E2E_DATABASE}": e2e databases must end in _e2e`)
  }
  return execFileSync(
    'psql',
    ['-h', 'localhost', '-U', 'test', '-d', E2E_DATABASE, '-v', 'ON_ERROR_STOP=1', '-q', '-At', ...args],
    { env: { ...process.env, PGPASSWORD: 'test' }, encoding: 'utf8' },
  ).trim()
}

/** Drop and recreate every table, then load the demo buildings, floors and seats. */
export function resetDatabase() {
  psql(['-f', `${SQL_DIR}reset.sql`, '-f', `${SQL_DIR}schema.sql`, '-f', `${SQL_DIR}seed.sql`])
}

/**
 * Run one SQL statement, for things the employee API can't do yet (e.g. an engineer
 * blocking a ticket). Returns psql's unaligned output.
 * @param {string} statement
 */
export function sql(statement) {
  return psql(['-c', statement])
}
