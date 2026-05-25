/**
 * Production integration test for the /movie endpoints.
 *
 * Usage:
 *   npm run test:prod:movies -- <api-key>
 *
 * Makes ~19 requests against the live API. All expected values are derived
 * from the known dataset (8 movies total):
 *
 *   ID                         Name                           runtime  budget  wins
 *   5cd95395de30eff6ebccde56   The Lord of the Rings Series   558      281     17
 *   5cd95395de30eff6ebccde57   The Hobbit Series              462      675      1
 *   5cd95395de30eff6ebccde58   The Unexpected Journey         169      200      1
 *   5cd95395de30eff6ebccde59   The Desolation of Smaug        161      217      0
 *   5cd95395de30eff6ebccde5a   The Battle of the Five Armies  144      250      0
 *   5cd95395de30eff6ebccde5b   The Two Towers                 179       94      2
 *   5cd95395de30eff6ebccde5c   The Fellowship of the Ring     178       93      4
 *   5cd95395de30eff6ebccde5d   The Return of the King         201       94     11
 */

import { TheOneApiClient, AuthenticationError, NotFoundError, type PaginatedResponse, type Movie } from '../src/index';

// ── Helpers ──────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${RED}✗${RESET} ${name}`);
    console.log(`    ${DIM}${e instanceof Error ? e.message : String(e)}${RESET}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${BOLD}${title}${RESET}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const apiKey = process.argv[2];

if (!apiKey) {
  console.error('Usage: npm run test:prod:movies -- <api-key>');
  process.exit(1);
}

const FELLOWSHIP_ID  = '5cd95395de30eff6ebccde5c';
const INVALID_ID     = '000000000000000000000000';

async function run(): Promise<void> {
  const client = new TheOneApiClient({ apiKey });

  // ── movies.get() ────────────────────────────────────────────────────────────

  section('movies.get()');

  await test('fetches a known movie by ID', async () => {
    const movie = await client.movies.get(FELLOWSHIP_ID);
    assert(movie._id === FELLOWSHIP_ID, `expected _id "${FELLOWSHIP_ID}", got "${movie._id}"`);
    assert(movie.name === 'The Fellowship of the Ring', `expected name "The Fellowship of the Ring", got "${movie.name}"`);
    assert(movie.runtimeInMinutes === 178, `expected runtimeInMinutes 178, got ${movie.runtimeInMinutes}`);
    assert(movie.academyAwardWins === 4, `expected academyAwardWins 4, got ${movie.academyAwardWins}`);
  });

  await test('throws NotFoundError for an unknown ID', async () => {
    try {
      await client.movies.get(INVALID_ID);
      throw new Error('no error was thrown');
    } catch (e) {
      assert(e instanceof NotFoundError, `expected NotFoundError, got ${(e as Error)?.constructor?.name}`);
    }
  });

  await test('throws AuthenticationError for an invalid API key', async () => {
    const badClient = new TheOneApiClient({ apiKey: 'bad-key' });
    try {
      await badClient.movies.get(FELLOWSHIP_ID);
      throw new Error('no error was thrown');
    } catch (e) {
      assert(e instanceof AuthenticationError, `expected AuthenticationError, got ${(e as Error)?.constructor?.name}`);
    }
  });

  await test('uses a custom fetch function when provided', async () => {
    let callCount = 0;
    const customClient = new TheOneApiClient({
      apiKey,
      fetch: (url, init) => { callCount++; return globalThis.fetch(url, init); },
    });
    const movie = await customClient.movies.get(FELLOWSHIP_ID);
    assert(callCount === 1, `expected custom fetch to be called once, got ${callCount}`);
    assert(movie._id === FELLOWSHIP_ID, `expected _id "${FELLOWSHIP_ID}", got "${movie._id}"`);
  });

  // ── movies.list() — no filters ───────────────────────────────────────────────

  section('movies.list() — no filters');

  await test('returns all 8 movies with correct pagination metadata', async () => {
    const result = await client.movies.list();
    assert(result.total === 8, `expected total 8, got ${result.total}`);
    assert(result.items.length === 8, `expected 8 items, got ${result.items.length}`);
    assert(result.page === 1, `expected page 1, got ${result.page}`);
    assert(result.next === null, 'expected next to be null on a single page result');
  });

  // ── movies.list() — pagination ───────────────────────────────────────────────

  section('movies.list() — pagination');

  let page1: PaginatedResponse<Movie> | null = null;
  let page2: PaginatedResponse<Movie> | null = null;

  await test('respects limit and exposes correct page metadata', async () => {
    page1 = await client.movies.list({ limit: 3 });
    assert(page1.items.length === 3, `expected 3 items, got ${page1.items.length}`);
    assert(page1.page === 1, `expected page 1, got ${page1.page}`);
    assert(page1.pages === 3, `expected 3 pages (ceil(8 / 3)), got ${page1.pages}`);
    assert(page1.next !== null, 'expected next to be non-null on page 1 of 3');
  });

  await test('next() fetches the following page', async () => {
    assert(page1?.next != null, 'skipped — page1 not available');
    page2 = await page1!.next!();
    assert(page2.page === 2, `expected page 2, got ${page2.page}`);
    assert(page2.items.length === 3, `expected 3 items on page 2, got ${page2.items.length}`);
    assert(page2.next !== null, 'expected next to be non-null on page 2 of 3');
  });

  await test('next() on the last page is null', async () => {
    assert(page2?.next != null, 'skipped — page2 not available');
    const page3 = await page2!.next!();
    assert(page3.page === 3, `expected page 3, got ${page3.page}`);
    assert(page3.items.length === 2, `expected 2 items on last page (8 mod 3), got ${page3.items.length}`);
    assert(page3.next === null, 'expected next to be null on the last page');
  });

  // ── movies.list() — string filters ───────────────────────────────────────────

  section('movies.list() — string filters');

  await test('exact name match', async () => {
    const result = await client.movies.list({ name: 'The Two Towers' });
    assert(result.items.length === 1, `expected 1 item, got ${result.items.length}`);
    assert(result.items[0].name === 'The Two Towers', `expected "The Two Towers", got "${result.items[0].name}"`);
  });

  await test('include list (array) returns only the named movies', async () => {
    const result = await client.movies.list({
      name: ['The Two Towers', 'The Fellowship of the Ring'],
    });
    const names = result.items.map(m => m.name);
    assert(result.items.length === 2, `expected 2 items, got ${result.items.length}`);
    assert(names.includes('The Two Towers'), 'expected "The Two Towers" in results');
    assert(names.includes('The Fellowship of the Ring'), 'expected "The Fellowship of the Ring" in results');
  });

  await test('negate match excludes the named movie', async () => {
    const result = await client.movies.list({ name: { neq: 'The Hobbit Series' } });
    assert(result.items.length === 7, `expected 7 items, got ${result.items.length}`);
    assert(result.items.every(m => m.name !== 'The Hobbit Series'), '"The Hobbit Series" was not excluded');
  });

  await test('regex filter matches by pattern', async () => {
    // /towers|fellowship/i matches "The Two Towers" and "The Fellowship of the Ring"
    const result = await client.movies.list({ name: { regex: '/towers|fellowship/i' } });
    const names = result.items.map(m => m.name);
    assert(result.items.length === 2, `expected 2 items, got ${result.items.length}`);
    assert(names.includes('The Two Towers'), 'expected "The Two Towers" in results');
    assert(names.includes('The Fellowship of the Ring'), 'expected "The Fellowship of the Ring" in results');
  });

  await test('negate regex excludes matching movies', async () => {
    // /hobbit/i only matches "The Hobbit Series" — the three Hobbit films don't have "hobbit" in the title
    const result = await client.movies.list({ name: { neq: { regex: '/hobbit/i' } } });
    assert(result.items.length === 7, `expected 7 items, got ${result.items.length}`);
    assert(result.items.every(m => !/hobbit/i.test(m.name)), '"The Hobbit Series" was not excluded by negate regex');
  });

  await test('negate match with array excludes multiple named movies', async () => {
    const result = await client.movies.list({
      name: { neq: ['The Two Towers', 'The Fellowship of the Ring'] },
    });
    assert(result.items.length === 6, `expected 6 items, got ${result.items.length}`);
    assert(result.items.every(m => m.name !== 'The Two Towers'), '"The Two Towers" was not excluded');
    assert(result.items.every(m => m.name !== 'The Fellowship of the Ring'), '"The Fellowship of the Ring" was not excluded');
  });

  // ── movies.list() — numeric filters (bundled) ─────────────────────────────────

  section('movies.list() — numeric filters (bundled)');

  await test('lt + gte bundled: isolates The Unexpected Journey', async () => {
    // runtimeInMinutes < 170  →  Unexpected Journey (169), Desolation of Smaug (161), Battle of Five Armies (144)
    // academyAwardWins >= 1   →  of those, only Unexpected Journey (1); Desolation and Battle have 0
    const result = await client.movies.list({
      runtimeInMinutes: { lt: 170 },
      academyAwardWins: { gte: 1 },
    });
    assert(result.items.length === 1, `expected 1 item, got ${result.items.length}`);
    assert(result.items[0].name === 'The Unexpected Journey', `expected "The Unexpected Journey", got "${result.items[0].name}"`);
  });

  await test('gt + neq bundled: isolates The Hobbit Series', async () => {
    // runtimeInMinutes > 400  →  LotR Series (558), Hobbit Series (462)
    // academyAwardWins != 17  →  excludes LotR Series (17), leaves Hobbit Series (1)
    const result = await client.movies.list({
      runtimeInMinutes: { gt: 400 },
      academyAwardWins: { neq: 17 },
    });
    assert(result.items.length === 1, `expected 1 item, got ${result.items.length}`);
    assert(result.items[0].name === 'The Hobbit Series', `expected "The Hobbit Series", got "${result.items[0].name}"`);
  });

  await test('budgetInMillions lt: isolates the three LotR trilogy films', async () => {
    // Two Towers (94), Fellowship (93), Return of the King (94) all have budget < 100
    const result = await client.movies.list({ budgetInMillions: { lt: 100 } });
    const names = result.items.map(m => m.name);
    assert(result.items.length === 3, `expected 3 items, got ${result.items.length}`);
    assert(names.includes('The Two Towers'), 'expected "The Two Towers" in results');
    assert(names.includes('The Fellowship of the Ring'), 'expected "The Fellowship of the Ring" in results');
    assert(names.includes('The Return of the King'), 'expected "The Return of the King" in results');
  });

  // ── movies.list() — exists filters ───────────────────────────────────────────

  section('movies.list() — exists filters');

  await test('exists: true returns all movies', async () => {
    const result = await client.movies.list({ name: { exists: true } });
    assert(result.items.length === 8, `expected 8 items, got ${result.items.length}`);
  });

  await test('exists: false returns no movies (every movie has a name)', async () => {
    const result = await client.movies.list({ name: { exists: false } });
    assert(result.items.length === 0, `expected 0 items, got ${result.items.length}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────

  const total = passed + failed;
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`${BOLD}${failed === 0 ? GREEN : RED}${passed}/${total} tests passed${RESET}`);

  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error('\nUnexpected error:', e);
  process.exit(1);
});
