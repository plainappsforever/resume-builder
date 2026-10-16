import type { DateRangeErrors } from '@/engine/dates';

/** Input the database layer refuses before writing anything (field → i18n key of the message). */
export class ValidationError extends Error {
  constructor(readonly fields: DateRangeErrors & Record<string, string | undefined>) {
    super(`Invalid input: ${JSON.stringify(fields)}`);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: number) {
    super(`${what} ${id} not found`);
    this.name = 'NotFoundError';
  }
}
