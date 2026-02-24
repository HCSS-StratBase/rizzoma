#!/usr/bin/env node
/**
 * Migration script: Fix "Anonymous" author names on blips
 *
 * This script:
 * 1. Finds all blips with authorName = "Anonymous"
 * 2. Looks up the user by authorId
 * 3. Updates the blip with the user's actual name (or email prefix if no name)
 *
 * Usage:
 *   node scripts/fix-anonymous-authors.cjs [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be changed without making changes
 */

const http = require('http');

const COUCH_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_DB = process.env.COUCHDB_DB || 'project_rizzoma';
const COUCH_USER = process.env.COUCHDB_USER || 'admin';
const COUCH_PASS = process.env.COUCHDB_PASSWORD || 'password';

const DRY_RUN = process.argv.includes('--dry-run');

async function couchRequest(method, path, body = null) {
  const url = new URL(`${COUCH_URL}/${COUCH_DB}${path}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || 5984,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64')
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function findAnonymousBlips() {
  const result = await couchRequest('POST', '/_find', {
    selector: {
      type: 'blip',
      authorName: 'Anonymous',
      authorId: { $exists: true }
    },
    limit: 10000
  });

  if (result.status !== 200) {
    throw new Error(`Failed to query blips: ${JSON.stringify(result.data)}`);
  }

  return result.data.docs || [];
}

async function findUserById(userId) {
  const result = await couchRequest('GET', `/${encodeURIComponent(userId)}`);

  if (result.status === 200) {
    return result.data;
  }
  return null;
}

async function updateBlip(blip, newAuthorName) {
  const updated = {
    ...blip,
    authorName: newAuthorName
  };

  const result = await couchRequest('PUT', `/${encodeURIComponent(blip._id)}`, updated);

  if (result.status !== 201 && result.status !== 200) {
    throw new Error(`Failed to update blip ${blip._id}: ${JSON.stringify(result.data)}`);
  }

  return result.data;
}

async function main() {
  console.log('=== Fix Anonymous Authors Migration ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Database: ${COUCH_URL}/${COUCH_DB}`);
  console.log('');

  // Find all blips with Anonymous author
  console.log('Finding blips with "Anonymous" authorName...');
  const blips = await findAnonymousBlips();
  console.log(`Found ${blips.length} blips to fix\n`);

  if (blips.length === 0) {
    console.log('No blips need fixing. Done!');
    return;
  }

  // Group by authorId to minimize user lookups
  const byAuthor = {};
  for (const blip of blips) {
    if (!byAuthor[blip.authorId]) {
      byAuthor[blip.authorId] = [];
    }
    byAuthor[blip.authorId].push(blip);
  }

  console.log(`Unique authors: ${Object.keys(byAuthor).length}\n`);

  // Cache user lookups
  const userCache = {};
  let updated = 0;
  let failed = 0;

  for (const [authorId, authorBlips] of Object.entries(byAuthor)) {
    // Look up user
    if (!userCache[authorId]) {
      const user = await findUserById(authorId);
      if (user) {
        // Prefer name, fall back to email prefix
        const name = user.name && user.name.trim() && user.name !== 'Anonymous'
          ? user.name
          : user.email
            ? user.email.split('@')[0]
            : `User ${authorId.slice(-8)}`;
        userCache[authorId] = name;
      } else {
        userCache[authorId] = `User ${authorId.slice(-8)}`;
      }
    }

    const newName = userCache[authorId];
    console.log(`Author ${authorId.slice(-12)}... -> "${newName}" (${authorBlips.length} blips)`);

    for (const blip of authorBlips) {
      const blipPreview = (blip.content || '').replace(/<[^>]+>/g, '').slice(0, 40);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update: ${blip._id} "${blipPreview}..."`);
        updated++;
      } else {
        try {
          await updateBlip(blip, newName);
          console.log(`  Updated: ${blip._id} "${blipPreview}..."`);
          updated++;
        } catch (err) {
          console.error(`  FAILED: ${blip._id} - ${err.message}`);
          failed++;
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total blips processed: ${blips.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
