// Counts from the most recent Marketing Intelligence upload (shown on the Already Fetched page).
export const LAST_SCAN_STORAGE_KEY = 'intelligenceLastScan'

export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn(`Could not persist "${key}" to localStorage:`, error)
    return false
  }
}
