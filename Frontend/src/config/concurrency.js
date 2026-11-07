// Runs `fn` over every item with at most `limit` running at once, keeping results in order.
export const mapWithConcurrency = async (items, limit, fn, onProgress = () => {}) => {
  const results = new Array(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
      done += 1
      onProgress(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
