import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodTypeAny } from 'zod';

/**
 * Runtime validation for endpoints whose DTOs are Zod-inferred types.
 *
 * The global pipe in `main.ts` is class-validator's `ValidationPipe`, which
 * works off decorators on classes. Every module in this codebase that declares
 * `@Body() body: CreateXxxRequest` where the type is `z.infer<typeof Schema>`
 * therefore has **no runtime validation at all** — the type disappears at
 * compile time and anything can reach the database. This was observed live in
 * Stage 3d: a task create with an invalid `projectId` FK returned a raw 500
 * from Prisma instead of a 400.
 *
 * Usage: `@Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventRequest`.
 *
 * The declared TS type and the passed schema are the same source of truth, so
 * the annotation stays honest while the value is actually checked.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    // `@Request()`/custom decorators are not part of the validated contract.
    if (metadata.type === 'custom') return value as T;

    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || String(metadata.data ?? 'body'),
          errors: [issue.message],
        })),
      });
    }
    return parsed.data;
  }
}
