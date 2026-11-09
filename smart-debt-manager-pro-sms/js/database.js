/**
 * مدير الديون الذكي برو SMS - Smart Debt Manager Pro SMS
 * Database & Core State Repository
 */

const AppDatabase = (function() {
  'use strict';

  const DB_VERSION = '1.0.0';

  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl_default_1',
      name: 'تذكير السداد الافتراضي',
      content: 'مرحبًا {اسم_العميل}، نود تذكيرك بأن الرصيد المستحق عليك هو {الرصيد}. إجمالي الديون: {إجمالي_الديون}، وإجمالي المدفوعات: {إجمالي_المدفوعات}. التاريخ: {التاريخ}. شكرًا لك.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'tpl_short_2',
      name: 'تذكير قصير وعاجل',
      content: 'الأخ {اسم_العميل}، نرجو التكرم بسداد المبلغ المستحق وقدره {الرصيد} حتى تاريخ اليوم {التاريخ}. شاكرين حسن تعاونكم.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'tpl_detailed_3',
      name: 'إشعار كشف رصيد',
      content: 'عميلنا العزيز {اسم_العميل}، رصيد حسابك الحالي هو: {الرصيد}. (مجموع الديون: {إجمالي_الديون} - مجموع المسدد: {إجمالي_المدفوعات}). لمراجعة أي عملية يرجى التواصل معنا.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const DEFAULT_CURRENCIES = [
    { code: 'ر.ي', name: 'ريال يمني (ر.ي)', symbol: 'ر.ي' },
    { code: 'ر.س', name: 'ريال سعودي (ر.س)', symbol: 'ر.س' },
    { code: '$', name: 'دولار أمريكي ($)', symbol: '$' },
    { code: 'د.إ', name: 'درهم إماراتي (د.إ)', symbol: 'د.إ' },
    { code: 'ج.م', name: 'جنيه مصري (ج.م)', symbol: 'ج.م' },
    { code: 'د.ك', name: 'دينار كويتي (د.ك)', symbol: 'د.ك' },
    { code: 'ع.د', name: 'دينار عراقي (ع.د)', symbol: 'ع.د' },
    { code: 'ر.ع', name: 'ريال عماني (ر.ع)', symbol: 'ر.ع' },
    { code: 'د.أ', name: 'دينار أردني (د.أ)', symbol: 'د.أ' },
    { code: '€', name: 'يورو (€)', symbol: '€' }
  ];

  const DEFAULT_SETTINGS = {
    theme: 'light',
    accentColor: 'blue',
    currency: 'ر.ي',
    currencies: DEFAULT_CURRENCIES,
    customCurrencies: [],
    dateFormat: 'YYYY-MM-DD',
    preventOverpayment: true,
    appTitle: 'مدير الديون الذكي برو SMS',
    defaultCustomerIcon: '👤',
    availableIcons: ['👤', '👑', '🏪', '🛒', '🏢', '💼', '⭐', '🚗', '📱', '🛠️', '🌾', '📦', '🤝', '💎', '👨‍💼', '👩‍💼'],
    customerCategories: ['عميل عادي', 'عميل VIP', 'مورد', 'عميل جديد', 'عميل متعثر', 'تاجر جملة', 'عميل تجزئة']
  };

  // State cache
  let state = {
    customers: [],
    transactions: [],
    remittances: [],
    templates: [],
    smsLogs: [],
    settings: { ...DEFAULT_SETTINGS }
  };

  // Initialize DB from Storage
  function init() {
    state.customers = StorageService.get('customers', []);
    state.transactions = StorageService.get('transactions', []);
    state.remittances = StorageService.get('remittances', []);
    state.templates = StorageService.get('templates', null);
    state.smsLogs = StorageService.get('smsLogs', []);
    state.settings = StorageService.get('settings', null);

    // Seed default templates if empty
    if (!state.templates || !state.templates.length) {
      state.templates = DEFAULT_TEMPLATES;
      StorageService.set('templates', state.templates);
    }

    // Seed default settings if empty
    if (!state.settings) {
      state.settings = { ...DEFAULT_SETTINGS };
      StorageService.set('settings', state.settings);
    } else {
      state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
      if (!Array.isArray(state.settings.currencies) || state.settings.currencies.length === 0) {
        state.settings.currencies = [...DEFAULT_CURRENCIES];
      }
      if (!Array.isArray(state.settings.customCurrencies)) {
        state.settings.customCurrencies = [];
      }
    }

    return true;
  }

  // Persist specific collection
  function persist(collectionName) {
    if (state[collectionName] !== undefined) {
      StorageService.set(collectionName, state[collectionName]);
    }
  }

  // Persist all state
  function persistAll() {
    StorageService.set('customers', state.customers);
    StorageService.set('transactions', state.transactions);
    StorageService.set('remittances', state.remittances);
    StorageService.set('templates', state.templates);
    StorageService.set('smsLogs', state.smsLogs);
    StorageService.set('settings', state.settings);
  }

  // Getters (cloned copies or references)
  function getCustomers() { return state.customers; }
  function getTransactions() { return state.transactions; }
  function getRemittances() { return state.remittances; }
  function getTemplates() { return state.templates; }
  function getSmsLogs() { return state.smsLogs; }
  function getSettings() { return state.settings; }
  function getDbVersion() { return DB_VERSION; }

  // Setters for entire collections (used by backup/restore)
  function setAllState(newState) {
    state.customers = newState.customers || [];
    state.transactions = newState.transactions || [];
    state.remittances = newState.remittances || [];
    state.templates = (newState.templates && newState.templates.length) ? newState.templates : DEFAULT_TEMPLATES;
    state.smsLogs = newState.smsLogs || [];
    state.settings = { ...DEFAULT_SETTINGS, ...(newState.settings || {}) };
    persistAll();
  }

  // Reset entire database to blank state
  function resetAll() {
    state.customers = [];
    state.transactions = [];
    state.remittances = [];
    state.templates = [...DEFAULT_TEMPLATES];
    state.smsLogs = [];
    state.settings = { ...DEFAULT_SETTINGS };
    persistAll();
  }

  return {
    init,
    persist,
    persistAll,
    getCustomers,
    getTransactions,
    getRemittances,
    getTemplates,
    getSmsLogs,
    getSettings,
    getDbVersion,
    setAllState,
    resetAll
  };
})();

window.AppDatabase = AppDatabase;
