export function isPromise<T>(promise: unknown): promise is Promise<T> {
  return Object.getPrototypeOf(promise) === Promise.prototype;
}
