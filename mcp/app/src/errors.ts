/** A refusal with its HTTP status and a code a client can act on (ai_not_connected, ai_model_gone…). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = "refused") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
