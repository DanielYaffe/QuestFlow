/**
 * Design-studio service error carrying the HTTP status the controllers should
 * return. Lives on its own so the leaf helpers (sprite history, sprite tools)
 * can throw it without importing a service.
 */
export class StudioError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StudioError';
  }
}
