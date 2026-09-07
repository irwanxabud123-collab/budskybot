export type ErrorClass = 'RETRYABLE'|'NON_RETRYABLE'|'UNKNOWN';
export class ClassifiedError extends Error { constructor(message: string, public readonly classification: ErrorClass, public readonly cause?: unknown) { super(message); } }
export const classifyHttp = (status: number): ErrorClass => status === 408 || status === 429 || status >= 500 ? 'RETRYABLE' : status >= 400 ? 'NON_RETRYABLE' : 'UNKNOWN';
