import { runMigrations, initializeMeta, checkDatabase, closeDatabase } from './index'

runMigrations()
const initializedAt = initializeMeta()
checkDatabase()
console.log(`Database ready; initialized at ${initializedAt}`)
closeDatabase()
