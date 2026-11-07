export interface RfcErrorResponse {
  timestamp: string;
  statusCode: number;
  error: string;
  message: string;
  details: Record<string, unknown>;
}

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly error: string;
  public readonly details: Record<string, unknown>;

  constructor(statusCode: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = HTTP_STATUS_NAMES[statusCode] ?? 'Application Error';
    this.details = details;
  }
}

export function buildRfcError(
  statusCode: number,
  message: string,
  details: Record<string, unknown> = {},
): RfcErrorResponse {
  return {
    timestamp: new Date().toISOString(),
    statusCode,
    error: HTTP_STATUS_NAMES[statusCode] ?? 'Application Error',
    message,
    details,
  };
}
