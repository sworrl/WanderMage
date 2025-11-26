/**
 * Safe localStorage wrapper that handles cases where localStorage is unavailable
 * (private browsing, security restrictions, etc.)
 */

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch (error) {
      console.warn(`Failed to read from localStorage: ${key}`, error)
      return null
    }
  },

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch (error) {
      console.warn(`Failed to write to localStorage: ${key}`, error)
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn(`Failed to remove from localStorage: ${key}`, error)
    }
  }
}

export default safeStorage
