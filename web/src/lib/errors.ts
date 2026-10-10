export class ApiError extends Error {
  status: number;
  field?: string;
  fieldErrors?: Record<string, string>;

  constructor(message: string, status: number, field?: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
    this.fieldErrors = fieldErrors;
  }
}
