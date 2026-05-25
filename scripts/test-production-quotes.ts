/**
 * Production integration test for the /quote endpoints.
 *
 * Usage:
 *   npm run test:prod:quotes -- <api-key>
 *
 * Makes ~17 requests against the live API. Movie IDs are taken from the
 * known dataset:
 *
 *   5cd95395de30eff6ebccde5b   The Two Towers
 *   5cd95395de30eff6ebccde5c   The Fellowship of the Ring
 *   5cd95395de30eff6ebccde5d   The Return of the King
 */

import {
  TheOneApiClient,
  AuthenticationError,
  NotFoundError,
  type PaginatedResponse,
  type Quote,
} from '../src/index';

// ── Helpers ──────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

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
  console.error('Usage: npm run test:prod:quotes -- <api-key>');
  process.exit(1);
}

const TWO_TOWERS_ID         = '5cd95395de30eff6ebccde5b';
const FELLOWSHIP_ID         = '5cd95395de30eff6ebccde5c';
const UNEXPECTED_JOURNEY_ID = '5cd95395de30eff6ebccde58'; // Hobbit — not supported by listQuotes
const INVALID_ID            = '000000000000000000000000';

async function run(): Promise<void> {
  const client = new TheOneApiClient({ apiKey });

  // ── quotes.get() ─────────────────────────────────────────────────────────────

  section('quotes.get()');

  // Discover a real quote ID to use in the get() test — we have no hardcoded
  // quote IDs, unlike the movie dataset which is fully known upfront.
  let sampleQuote: Quote | null = null;

  await test('discovers a sample quote for subsequent get() test', async () => {
    const result = await client.quotes.list({ limit: 1 });
    assert(result.items.length === 1, `expected 1 item, got ${result.items.length}`);
    sampleQuote = result.items[0];
  });

  await test('fetches a quote by ID and fields match', async () => {
    assert(sampleQuote !== null, 'skipped — sample quote not available');
    const quote = await client.quotes.get(sampleQuote!.id);
    assert(quote.id === sampleQuote!.id, `expected id "${sampleQuote!.id}", got "${quote.id}"`);
    assert(quote.dialog === sampleQuote!.dialog, `expected dialog "${sampleQuote!.dialog}", got "${quote.dialog}"`);
    assert(typeof quote.movie === 'string' && quote.movie.length > 0, 'expected movie to be a non-empty string ID');
    assert(typeof quote.character === 'string' && quote.character.length > 0, 'expected character to be a non-empty string ID');
  });

  await test('throws NotFoundError for an unknown ID', async () => {
    try {
      await client.quotes.get(INVALID_ID);
      throw new Error('no error was thrown');
    } catch (e) {
      assert(e instanceof NotFoundError, `expected NotFoundError, got ${(e as Error)?.constructor?.name}`);
    }
  });

  await test('throws AuthenticationError for an invalid API key', async () => {
    const badClient = new TheOneApiClient({ apiKey: 'bad-key' });
    try {
      await badClient.quotes.list();
      throw new Error('no error was thrown');
    } catch (e) {
      assert(e instanceof AuthenticationError, `expected AuthenticationError, got ${(e as Error)?.constructor?.name}`);
    }
  });

  // ── quotes.list() — no filters ───────────────────────────────────────────────

  section('quotes.list() — no filters');

  await test('returns quotes with correct metadata', async () => {
    const result = await client.quotes.list();
    assert(result.total > 0, `expected total > 0, got ${result.total}`);
    assert(result.items.length > 0, `expected items.length > 0, got ${result.items.length}`);
    assert(result.page === 1, `expected page 1, got ${result.page}`);
  });

  // ── quotes.list() — pagination ───────────────────────────────────────────────

  section('quotes.list() — pagination');

  let page1: PaginatedResponse<Quote> | null = null;

  await test('respects limit and exposes correct page metadata', async () => {
    page1 = await client.quotes.list({ limit: 5 });
    assert(page1.items.length === 5, `expected 5 items, got ${page1.items.length}`);
    assert(page1.page === 1, `expected page 1, got ${page1.page}`);
    assert(page1.pages > 1, `expected pages > 1, got ${page1.pages}`);
    assert(page1.next !== null, 'expected next to be non-null');
  });

  await test('next() fetches the following page', async () => {
    assert(page1?.next != null, 'skipped — page1 not available');
    const page2 = await page1!.next!();
    assert(page2.page === 2, `expected page 2, got ${page2.page}`);
    assert(page2.items.length === 5, `expected 5 items on page 2, got ${page2.items.length}`);
    assert(page2.next !== null, 'expected next to be non-null on page 2');
  });

  // ── quotes.list() — string filters ───────────────────────────────────────────

  section('quotes.list() — string filters');

  await test('regex on dialog matches expected quotes', async () => {
    // "precious" is Gollum's catchphrase — guaranteed to appear many times
    const result = await client.quotes.list({ dialog: { regex: '/precious/i' } });
    assert(result.items.length > 0, 'expected at least one "precious" quote, got 0');
    assert(
      result.items.every(q => /precious/i.test(q.dialog)),
      'not all results contain "precious"',
    );
  });

  await test('movie filter returns quotes from that film only', async () => {
    const result = await client.quotes.list({ movie: FELLOWSHIP_ID });
    assert(result.items.length > 0, `expected quotes for Fellowship, got 0`);
    assert(
      result.items.every(q => q.movie === FELLOWSHIP_ID),
      'not all results are from Fellowship',
    );
  });

  await test('negate movie filter excludes that film', async () => {
    const result = await client.quotes.list({ movie: { neq: FELLOWSHIP_ID } });
    assert(result.total > 0, 'expected quotes from other films, got 0');
    assert(
      result.items.every(q => q.movie !== FELLOWSHIP_ID),
      'Fellowship quotes were not excluded',
    );
  });

  await test('movie include-list (array) returns quotes from those films only', async () => {
    const result = await client.quotes.list({ movie: [TWO_TOWERS_ID, FELLOWSHIP_ID] });
    assert(result.items.length > 0, 'expected quotes from the two films, got 0');
    assert(
      result.items.every(q => q.movie === TWO_TOWERS_ID || q.movie === FELLOWSHIP_ID),
      'results include quotes from unexpected films',
    );
  });

  await test('character filter returns quotes from that character only', async () => {
    assert(sampleQuote !== null, 'skipped — sample quote not available');
    const result = await client.quotes.list({ character: sampleQuote!.character });
    assert(result.items.length > 0, 'expected at least one quote for the character');
    assert(
      result.items.every(q => q.character === sampleQuote!.character),
      'not all results are from the expected character',
    );
  });

  // ── quotes.list() — bundled filters ──────────────────────────────────────────

  section('quotes.list() — bundled filters');

  await test('movie + dialog regex: Fellowship quotes mentioning "fool"', async () => {
    // "Fool of a Took!" — Gandalf, Fellowship of the Ring
    const result = await client.quotes.list({
      movie: FELLOWSHIP_ID,
      dialog: { regex: '/fool/i' },
    });
    assert(result.items.length > 0, 'expected at least one "fool" quote from Fellowship');
    assert(result.items.every(q => q.movie === FELLOWSHIP_ID), 'not all results are from Fellowship');
    assert(result.items.every(q => /fool/i.test(q.dialog)), 'not all results match /fool/i');
  });

  await test('negate movie + dialog regex: "precious" quotes not from Fellowship', async () => {
    // Gollum says "precious" throughout Two Towers and Return of the King
    const result = await client.quotes.list({
      movie: { neq: FELLOWSHIP_ID },
      dialog: { regex: '/precious/i' },
    });
    assert(result.items.length > 0, 'expected "precious" quotes from films other than Fellowship');
    assert(result.items.every(q => q.movie !== FELLOWSHIP_ID), 'Fellowship quotes were not excluded');
    assert(result.items.every(q => /precious/i.test(q.dialog)), 'not all results match /precious/i');
  });

  // ── movies.listQuotes() ───────────────────────────────────────────────────────

  section('movies.listQuotes()');

  await test('returns quotes for a LotR trilogy film', async () => {
    const result = await client.movies.listQuotes(FELLOWSHIP_ID);
    assert(result.items.length > 0, 'expected quotes for Fellowship, got 0');
    assert(
      result.items.every(q => q.movie === FELLOWSHIP_ID),
      'not all results are from Fellowship',
    );
  });

  await test('respects dialog filter', async () => {
    const result = await client.movies.listQuotes(FELLOWSHIP_ID, {
      dialog: { regex: '/fool/i' },
    });
    assert(result.items.length > 0, 'expected at least one "fool" quote from Fellowship');
    assert(result.items.every(q => /fool/i.test(q.dialog)), 'not all results match /fool/i');
  });

  await test('respects limit and supports pagination via next()', async () => {
    const page1 = await client.movies.listQuotes(FELLOWSHIP_ID, { limit: 5 });
    assert(page1.items.length === 5, `expected 5 items, got ${page1.items.length}`);
    assert(page1.pages > 1, `expected pages > 1, got ${page1.pages}`);
    assert(page1.next !== null, 'expected next to be non-null');
    const page2 = await page1.next!();
    assert(page2.page === 2, `expected page 2, got ${page2.page}`);
    assert(page2.items.length > 0, `expected items on page 2, got 0`);
  });

  await test('Hobbit trilogy film returns no quotes (not supported by API)', async () => {
    // The API only supports quote lookup for the LotR trilogy
    const result = await client.movies.listQuotes(UNEXPECTED_JOURNEY_ID);
    assert(result.items.length === 0, `expected 0 quotes for Hobbit film, got ${result.items.length}`);
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
