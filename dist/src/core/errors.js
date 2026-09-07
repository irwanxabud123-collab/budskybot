export class ClassifiedError extends Error {
    classification;
    cause;
    constructor(message, classification, cause) {
        super(message);
        this.classification = classification;
        this.cause = cause;
    }
}
export const classifyHttp = (status) => status === 408 || status === 429 || status >= 500 ? 'RETRYABLE' : status >= 400 ? 'NON_RETRYABLE' : 'UNKNOWN';
