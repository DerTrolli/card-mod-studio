/**
 * Returns a debounced version of fn that fires after `waitMs` milliseconds
 * of silence. Consecutive calls within the wait window reset the timer.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
