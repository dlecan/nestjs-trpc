interface DualModeSchema {
  parse: (value: unknown) => unknown;
  parseAsync: (value: unknown) => Promise<unknown>;
}

function isDualModeSchema(schema: unknown): schema is DualModeSchema {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    typeof (schema as DualModeSchema).parse === 'function' &&
    typeof (schema as DualModeSchema).parseAsync === 'function'
  );
}

function isValidationVerdict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/**
 * tRPC's `getParseFn` binds `parseAsync` as soon as a validator exposes it, so every
 * procedure validates on the validator's async path. With zod that path costs several
 * times the sync one (colinhacks/zod#3446) and can never reach the compiled fast path,
 * since `zod/compile` hands any parse carrying an async context back to the interpreter.
 *
 * Returning a plain function keeps tRPC on its `ParserCustomValidatorEsque` branch, which
 * calls it as-is.
 */
export function syncFirstParser(schema: unknown): unknown {
  if (!isDualModeSchema(schema)) {
    return schema;
  }

  const parse = schema.parse.bind(schema);
  const parseAsync = schema.parseAsync.bind(schema);
  let asyncRequired = false;

  return (value: unknown): unknown => {
    if (asyncRequired) {
      return parseAsync(value);
    }

    try {
      return parse(value);
    } catch (error) {
      if (isValidationVerdict(error)) {
        throw error;
      }

      // The validator refused to run synchronously, which only an async refinement or
      // transform causes. Remembering it bounds the duplicate run of the schema's
      // synchronous callbacks to this first call rather than repeating it on every one.
      asyncRequired = true;
      return parseAsync(value);
    }
  };
}
