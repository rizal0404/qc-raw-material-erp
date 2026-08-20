export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unauthorized(code = 'AUTH_REQUIRED', message = 'Sesi login diperlukan.'): AppError {
  return new AppError(401, code, message);
}

export function forbidden(message = 'Anda tidak memiliki akses untuk aksi ini.'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Data tidak ditemukan.'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}
