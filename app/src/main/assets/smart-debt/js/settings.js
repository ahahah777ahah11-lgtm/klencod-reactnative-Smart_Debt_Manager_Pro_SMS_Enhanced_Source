/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Settings & Customization Service
 */

const SettingsService = (function() {
  'use strict';

  function getSettings() {
    return AppDatabase.getSettings();
  }

  function updateSettings(newSettings) {
    const current = AppDatabase.getSettings();
    const updated = { ...current, ...newSettings };
    
    // Apply theme to DOM immediately
    applyTheme(updated);

    AppDatabase.persist('settings');
    return updated;
  }

  function applyTheme(settings) {
    const body = document.body;
    
    // Dark mode
    if (settings.theme === 'dark') {
      body.classList.add('theme-dark');
    } else {
      body.classList.remove('theme-dark');
    }

    // Accent color
    body.classList.remove('accent-emerald', 'accent-purple', 'accent-navy');
    if (settings.accentColor === 'emerald') {
      body.classList.add('accent-emerald');
    } else if (settings.accentColor === 'purple') {
      body.classList.add('accent-purple');
    } else if (settings.accentColor === 'navy') {
      body.classList.add('accent-navy');
    }
  }

  function getCurrencies() {
    const s = AppDatabase.getSettings();
    return s.currencies || [];
  }

  function addCustomCurrency(data) {
    if (!data.name || !data.name.trim()) {
      throw new Error('يرجى إدخال اسم العملة (مثال: ريال عماني، يورو).');
    }
    if (!data.symbol || !data.symbol.trim()) {
      throw new Error('يرجى إدخال رمز العملة (مثال: ر.ع، €).');
    }

    const s = AppDatabase.getSettings();
    const symbol = data.symbol.trim();
    const name = data.name.trim();

    // Check duplicate symbol
    const exists = (s.currencies || []).some(c => c.code.toLowerCase() === symbol.toLowerCase() || c.symbol.toLowerCase() === symbol.toLowerCase());
    if (exists) {
      throw new Error(`العملة بالرمز "${symbol}" مسجلة مسبقاً في النظام.`);
    }

    const newCurr = {
      code: symbol,
      symbol: symbol,
      name: `${name} (${symbol})`,
      isCustom: true,
      createdAt: new Date().toISOString()
    };

    s.currencies = s.currencies || [];
    s.currencies.push(newCurr);

    s.customCurrencies = s.customCurrencies || [];
    s.customCurrencies.push(newCurr);

    AppDatabase.persist('settings');
    return newCurr;
  }

  function deleteCustomCurrency(code) {
    const s = AppDatabase.getSettings();
    if (s.currency === code) {
      throw new Error('لا يمكن حذف هذه العملة لأنها محددة كعملة افتراضية حالية للنظام. يرجى اختيار عملة افتراضية أخرى أولاً.');
    }

    s.currencies = (s.currencies || []).filter(c => c.code !== code);
    s.customCurrencies = (s.customCurrencies || []).filter(c => c.code !== code);

    AppDatabase.persist('settings');
    return true;
  }

  return {
    getSettings,
    updateSettings,
    applyTheme,
    getCurrencies,
    addCustomCurrency,
    deleteCustomCurrency
  };
})();

window.SettingsService = SettingsService;
