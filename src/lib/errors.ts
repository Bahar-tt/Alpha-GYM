export function getApiErrorMessage(err: unknown, fallback = 'خطا در ذخیره اطلاعات'): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
