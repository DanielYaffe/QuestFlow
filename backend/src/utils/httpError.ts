// Service-layer error carrying an HTTP status for controllers to forward.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
