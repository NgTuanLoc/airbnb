export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
  /** A machine-readable reason for a failure the client has to tell apart (e.g. "account_exists"). */
  code?: string;
}

export function ok<T>(data: T, meta?: ApiResponse<T>["meta"]): ApiResponse<T> {
  return { success: true, data, meta };
}

export function fail<T = never>(error: string, code?: string): ApiResponse<T> {
  return code ? { success: false, error, code } : { success: false, error };
}
