/**
 * SDK demo — run with:
 *   npx tsx demo.ts <api-key>
 */

import { TheOneApiClient, NotFoundError, TheOneApiError } from './src/index';

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Usage: npx tsx demo.ts <api-key>');
  process.exit(1);
}

const client = new TheOneApiClient({ apiKey });

const FELLOWSHIP_ID = '5cd95395de30eff6ebccde5c';

async function main() {
  // Single movie by ID
  console.log('\n── Single movie ──────────────────────────────────────');
  const movie = await client.movies.get(FELLOWSHIP_ID);
  console.log(`${movie.name} — ${movie.runtimeInMinutes} min, ${movie.academyAwardWins} Academy Awards`);

  // All movies
  console.log('\n── All movies ────────────────────────────────────────');
  const { items: allMovies } = await client.movies.list();
  allMovies.forEach(m => console.log(`  ${m.name}`));

  // Filtered: LotR trilogy only (budget under $100M)
  console.log('\n── LotR trilogy films (budget < $100M) ───────────────');
  const lotr = await client.movies.list({ budgetInMillions: { lt: 100 } });
  lotr.items.forEach(m => console.log(`  ${m.name} — $${m.budgetInMillions}M budget`));

  // Quotes for a movie, with a dialog filter
  console.log('\n── Fellowship quotes matching /fool/i ────────────────');
  const foolQuotes = await client.movies.listQuotes(FELLOWSHIP_ID, { dialog: { regex: '/fool/i' } });
  foolQuotes.items.forEach(q => console.log(`  "${q.dialog}"`));

  // Pagination: walk all movies two at a time
  console.log('\n── Pagination (all movies, 2 per page) ───────────────');
  let page = await client.movies.list({ limit: 2 });
  while (true) {
    page.items.forEach(m => console.log(`  [page ${page.page}] ${m.name}`));
    if (!page.next) break;
    page = await page.next();
  }

  // Error handling
  console.log('\n── Error handling ────────────────────────────────────');
  try {
    await client.movies.get('000000000000000000000000');
  } catch (e) {
    if (e instanceof NotFoundError) {
      console.log(`  NotFoundError: ${e.message}`);
    } else if (e instanceof TheOneApiError) {
      console.log(`  TheOneApiError (${e.status}): ${e.message}`);
    }
  }
}

main().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
