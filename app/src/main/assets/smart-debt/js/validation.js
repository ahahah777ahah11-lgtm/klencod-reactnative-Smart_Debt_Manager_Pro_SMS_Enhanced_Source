/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Validation & Sanitization Module
 */

const ValidationService = (function() {
  'use strict';

  // Generates clean UUID / unique ID
  function generateId(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${randomPart}`;
  }

  // Normalizes Arabic and Persian digits to standard Western digits
  function normalizeDigits(str) {
    if (!str) return '';
    return String(str)
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .trim();
  }

  // Normalizes phone numbers for duplicate detection and SMS links
  function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = normalizeDigits(phone).replace(/[^\d+]/g, '');
    // Remove leading zeros or country prefixes for standard comparison
    return cleaned;
  }

  // Validates phone number format
  function isValidPhone(phone) {
    const cleaned = normalizePhone(phone);
    if (!cleaned) return false;
    // Check length between 7 and 15 digits
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
  }

  // Validates amount: must be positive number > 0, finite, not NaN
  function isValidAmount(val) {
    if (val === null || val === undefined || val === '') return false;
    const num = Number(normalizeDigits(String(val)).replace(/,/g, ''));
    return !isNaN(num) && isFinite(num) && num > 0;
  }

  // Parses amount safely
  function parseAmount(val) {
    if (!val && val !== 0) return 0;
    const cleaned = normalizeDigits(String(val)).replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  // Normalizes reference strings (e.g., " ت / 8000011 " -> "ت/8000011")
  function normalizeReference(ref) {
    if (!ref) return '';
    return normalizeDigits(String(ref))
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  // Normalizes Arabic text for duplicate search (removes tashkeel, standardizes alef)
  function normalizeArabicText(text) {
    if (!text) return '';
    return String(text)
      .trim()
      .replace(/[\u064B-\u065F]/g, '') // Remove harakat
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase();
  }

  // Formats currency number
  function formatMoney(amount, currency = 'ر.ي') {
    const num = parseAmount(amount);
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = (parts[1] === '00') ? parts[0] : parts.join('.');
    return `${formatted} ${currency}`;
  }

  // Formats date to YYYY-MM-DD
  function formatDate(dateInput = new Date()) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return {
    generateId,
    normalizeDigits,
    normalizePhone,
    isValidPhone,
    isValidAmount,
    parseAmount,
    normalizeReference,
    normalizeArabicText,
    formatMoney,
    formatDate
  };
})();

window.ValidationService = ValidationService;
