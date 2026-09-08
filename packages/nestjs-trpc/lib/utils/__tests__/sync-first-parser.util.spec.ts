import { z } from 'zod';
import { syncFirstParser } from '../sync-first-parser.util';

type ParserFn = (value: unknown) => unknown;

describe('syncFirstParser', () => {
  it('leaves a schema untouched when it exposes no dual-mode parser', () => {
    const standardSchemaOnly = { '~standard': { validate: jest.fn() } };

    expect(syncFirstParser(standardSchemaOnly)).toBe(standardSchemaOnly);
    expect(syncFirstParser(undefined)).toBeUndefined();
    expect(syncFirstParser((value: unknown) => value)).toBeInstanceOf(Function);
  });

  it('parses through the synchronous path and never touches parseAsync', () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    const parseAsync = jest.spyOn(schema, 'parseAsync');
    const parser = syncFirstParser(schema) as ParserFn;

    expect(parser({ name: 'sia', count: 2 })).toEqual({ name: 'sia', count: 2 });
    expect(parseAsync).not.toHaveBeenCalled();
  });

  it('propagates the validation error untouched instead of retrying asynchronously', () => {
    const schema = z.object({ name: z.string() });
    const parseAsync = jest.spyOn(schema, 'parseAsync');
    const parser = syncFirstParser(schema) as ParserFn;

    expect(() => parser({ name: 42 })).toThrow(z.ZodError);
    expect(parseAsync).not.toHaveBeenCalled();
  });

  it('falls back to parseAsync for a schema carrying an async refinement', async () => {
    const schema = z
      .object({ name: z.string() })
      .refine(async (value) => value.name.length > 0, 'name must not be empty');
    const parser = syncFirstParser(schema) as ParserFn;

    await expect(parser({ name: 'sia' })).resolves.toEqual({ name: 'sia' });
  });

  it('attempts the synchronous path only once for an async schema', async () => {
    const synchronousCheck = jest.fn().mockReturnValue(true);
    const schema = z
      .object({ name: z.string() })
      .refine(synchronousCheck, 'sync check')
      .refine(async (value) => value.name.length > 0, 'async check');
    const parser = syncFirstParser(schema) as ParserFn;

    await parser({ name: 'a' });
    await parser({ name: 'b' });
    await parser({ name: 'c' });

    // Three calls, plus the single aborted synchronous attempt of the first one.
    expect(synchronousCheck).toHaveBeenCalledTimes(4);
  });

  it('keeps the parsed output of a transforming schema', () => {
    const schema = z.object({ name: z.string().transform((name) => name.length) });
    const parser = syncFirstParser(schema) as ParserFn;

    expect(parser({ name: 'abcd' })).toEqual({ name: 4 });
  });
});
