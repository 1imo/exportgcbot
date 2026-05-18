export function withErrorBoundary<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  return (async (...args: unknown[]) => {
    try {
      await fn(...(args as Parameters<T>));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }) as T;
}
