// Seed one verified local test account: node seed-one.mjs <email> <password>   (needs COUCHDB_URL / COUCHDB_DB)
import { seedVerifiedE2EAccount } from '../lib/e2e-sharing-fixtures.mjs';
await seedVerifiedE2EAccount(process.argv[2], process.argv[3]);
console.log('seeded', process.argv[2]);
