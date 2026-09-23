import { resetDatabase } from './db.js'

/** Start every run from a clean e2e database with only the seeded locations. */
export default function globalSetup() {
  resetDatabase()
}
