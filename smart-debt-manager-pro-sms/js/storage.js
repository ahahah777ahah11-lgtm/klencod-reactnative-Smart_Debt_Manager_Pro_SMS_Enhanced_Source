/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Storage Abstraction Layer
 * Provides robust, resilient local storage with error handling
 * and abstraction for future IndexedDB / SQLite migration.
 */

const StorageService = (function() {
  'use strict';

  const STORAGE_KEY_PREFIX = 'smart_debt_pro_';

  function isAvailable() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage is not available:', e);
      return false;
    }
  }

  function get(key, defaultValue = null) {
    if (!isAvailable()) return defaultValue;
    try {
      const item = window.localStorage.getItem(STORAGE_KEY_PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Error reading key "${key}" from storage:`, e);
      return defaultValue;
    }
  }

  function set(key, value) {
    if (!isAvailable()) {
      throw new Error('وحدة التخزين المحلي غير متاحة على هذا الجهاز.');
    }
    try {
      const serialized = JSON.stringify(value);
      window.localStorage.setItem(STORAGE_KEY_PREFIX + key, serialized);
      return true;
    } catch (e) {
      console.error(`Error writing key "${key}" to storage:`, e);
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        throw new Error('مساحة التخزين ممتلئة! يرجى أخذ نسخة احتياطية وحذف بعض السجلات غير الضرورية.');
      }
      throw new Error('فشل حفظ البيانات محلياً: ' + e.message);
    }
  }

  function remove(key) {
    if (!isAvailable()) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY_PREFIX + key);
    } catch (e) {
      console.error(`Error removing key "${key}":`, e);
    }
  }

  function clearAll() {
    if (!isAvailable()) return;
    try {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
    } catch (e) {
      console.error('Error clearing local storage:', e);
    }
  }

  return {
    isAvailable,
    get,
    set,
    remove,
    clearAll
  };
})();

// Export globally
window.StorageService = StorageService;
