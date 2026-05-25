import { describe, it, expect, vi } from 'vitest';
import { serializeFilterParam, buildPaginatedResponse } from '../utils';

// ── serializeFilterParam ──────────────────────────────────────────────────────

function serialize(field: string, value: unknown): URLSearchParams {
  const params = new URLSearchParams();
  serializeFilterParam(field, value, params);
  return params;
}

describe('serializeFilterParam', () => {
  describe('plain values', () => {
    it('plain string → field=value', () => {
      expect(serialize('name', 'Gandalf').get('name')).toBe('Gandalf');
    });

    it('plain number → field=value', () => {
      expect(serialize('limit', 10).get('limit')).toBe('10');
    });

    it('string array → field=val1,val2', () => {
      expect(serialize('name', ['Frodo', 'Sam']).get('name')).toBe('Frodo,Sam');
    });

    it('undefined → no param added', () => {
      expect(serialize('name', undefined).has('name')).toBe(false);
    });

    it('null → no param added', () => {
      expect(serialize('name', null).has('name')).toBe(false);
    });
  });

  describe('numeric operators', () => {
    it('{ lt } → field<value= (operator embedded in key)', () => {
      const p = serialize('budget', { lt: 100 });
      expect(p.has('budget<100')).toBe(true);
      expect(p.get('budget<100')).toBe('');
    });

    it('{ lte } → field<=value (key ends with <, value is the number)', () => {
      const p = serialize('runtime', { lte: 160 });
      expect(p.get('runtime<')).toBe('160');
    });

    it('{ gt } → field>value= (operator embedded in key)', () => {
      const p = serialize('wins', { gt: 0 });
      expect(p.has('wins>0')).toBe(true);
      expect(p.get('wins>0')).toBe('');
    });

    it('{ gte } → field>=value (key ends with >, value is the number)', () => {
      const p = serialize('runtime', { gte: 160 });
      expect(p.get('runtime>')).toBe('160');
    });

    it('{ neq } → field!=value', () => {
      const p = serialize('wins', { neq: 17 });
      expect(p.get('wins!')).toBe('17');
    });

    it('{ exists: true } → field= (key present, empty value)', () => {
      const p = serialize('name', { exists: true });
      expect(p.has('name')).toBe(true);
      expect(p.get('name')).toBe('');
    });

    it('{ exists: false } → !field= (negated key)', () => {
      const p = serialize('name', { exists: false });
      expect(p.has('!name')).toBe(true);
    });
  });

  describe('string operators', () => {
    it('{ neq: string } → field!=value', () => {
      expect(serialize('name', { neq: 'The Hobbit Series' }).get('name!')).toBe('The Hobbit Series');
    });

    it('{ neq: string[] } → field!=val1,val2', () => {
      expect(serialize('name', { neq: ['Frodo', 'Sam'] }).get('name!')).toBe('Frodo,Sam');
    });

    it('{ neq: { regex } } → field!=/pattern/flags', () => {
      expect(serialize('dialog', { neq: { regex: '/fool/i' } }).get('dialog!')).toBe('/fool/i');
    });

    it('{ regex } → field=/pattern/flags', () => {
      expect(serialize('dialog', { regex: '/precious/i' }).get('dialog')).toBe('/precious/i');
    });

    it('{ exists: true } → field= (key present, empty value)', () => {
      const p = serialize('dialog', { exists: true });
      expect(p.has('dialog')).toBe(true);
      expect(p.get('dialog')).toBe('');
    });

    it('{ exists: false } → !field=', () => {
      expect(serialize('dialog', { exists: false }).has('!dialog')).toBe(true);
    });
  });
});

// ── buildPaginatedResponse ────────────────────────────────────────────────────

describe('buildPaginatedResponse', () => {
  const rawPage1 = {
    docs: [{ id: '1', name: 'Movie A' }, { id: '2', name: 'Movie B' }],
    total: 10,
    limit: 2,
    offset: 0,
    page: 1,
    pages: 5,
  };

  it('maps docs to items', () => {
    const result = buildPaginatedResponse(rawPage1, {}, vi.fn());
    expect(result.items).toEqual(rawPage1.docs);
  });

  it('preserves all pagination fields', () => {
    const result = buildPaginatedResponse(rawPage1, {}, vi.fn());
    expect(result.total).toBe(10);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(5);
  });

  it('next is null on the last page', () => {
    const lastPage = { ...rawPage1, page: 5, pages: 5 };
    const result = buildPaginatedResponse(lastPage, {}, vi.fn());
    expect(result.next).toBeNull();
  });

  it('next is non-null when not on the last page', () => {
    const result = buildPaginatedResponse(rawPage1, {}, vi.fn());
    expect(result.next).not.toBeNull();
  });

  it('next calls the fetcher with page incremented by 1', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ...rawPage1, page: 2 });
    const result = buildPaginatedResponse(rawPage1, { limit: 2 }, fetcher);
    await result.next!();
    expect(fetcher).toHaveBeenCalledWith({ limit: 2, page: 2 });
  });

  it('next preserves all original params except page', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ...rawPage1, page: 2 });
    const params = { limit: 2, name: 'Frodo' };
    const result = buildPaginatedResponse(rawPage1, params, fetcher);
    await result.next!();
    expect(fetcher).toHaveBeenCalledWith({ limit: 2, name: 'Frodo', page: 2 });
  });
});
