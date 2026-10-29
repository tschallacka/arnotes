// Nuxt types `$fetch` by route, which cannot say what a URL built from a
// resource name returns. The stores for a project's own collections state the
// row type themselves and go through this instead.
export const untypedFetch = $fetch as unknown as <R>(url: string, options?: Record<string, unknown>) => Promise<R>

/** The message a failed request carries, or the fallback when it carries none. */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { data?: { message?: string }, statusMessage?: string }
  return e?.data?.message ?? e?.statusMessage ?? fallback
}
