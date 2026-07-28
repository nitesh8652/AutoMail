export const safeSetItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn(`Could not persist "${key}" to localStorage:`, error)
    return false
  }
}
