/*
 * Store: all app data lives in localStorage under one key.
 *
 * Session rule: a new browser tab/session (empty sessionStorage) starts from the
 * default data. Reloading the same tab keeps your changes. Overrides:
 *   ?reset=1  force a re-seed now
 *   ?keep=1   keep existing data even on a fresh tab (e.g. second tab for kitchen)
 */
(function () {
  'use strict';

  const DATA_KEY = 'hillstreet.pos.data';
  const SESSION_KEY = 'hillstreet.pos.session';
  const USER_KEY = 'hillstreet.pos.user';
  const SEED_VERSION = 1;

  function read(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }
  function write(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch (e) { /* storage blocked: app keeps working in memory */ }
  }

  let idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return prefix + '-' + Date.now().toString(36) + idCounter.toString(36);
  }

  const Pricing = {
    compute(cart, state) {
      const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
      let discount = 0;
      let discountError = null;
      let rule = null;
      const code = (cart.discountCode || '').trim().toUpperCase();

      if (code) {
        rule = state.discounts.find((d) => d.code === code);
        const customer = cart.customerId && state.customers.find((c) => c.id === cart.customerId);
        if (!rule) discountError = 'Unknown discount code "' + code + '"';
        else if (subtotal < rule.minSubtotal) discountError = rule.code + ' needs a subtotal of at least LKR ' + rule.minSubtotal.toLocaleString('en-US');
        else if (rule.needsCustomer && !customer) discountError = rule.code + ' needs a loyalty customer on the order';
        else if (rule.minPoints && customer.points < rule.minPoints) discountError = customer.name + ' has ' + customer.points + ' points; ' + rule.code + ' needs ' + rule.minPoints;
        if (!discountError) {
          discount = rule.kind === 'percent' ? Math.round(subtotal * rule.value / 100) : Math.min(rule.value, subtotal);
        }
      }

      const serviceRate = cart.type === 'dine-in' ? state.settings.serviceCharge : 0;
      const service = Math.round((subtotal - discount) * serviceRate / 100);
      return {
        subtotal,
        discount,
        discountCode: discountError || !rule ? null : rule.code,
        pointsCost: discountError || !rule ? 0 : (rule.pointsCost || 0),
        discountError,
        serviceRate,
        service,
        total: subtotal - discount + service,
      };
    },
  };

  const Store = {
    state: null,
    freshStart: false,

    init() {
      const params = new URLSearchParams(location.search);
      const isFreshSession = !read(sessionStorage, SESSION_KEY);
      let data = null;
      try { data = JSON.parse(read(localStorage, DATA_KEY) || 'null'); } catch (e) { data = null; }

      const mustSeed = params.has('reset')
        || (isFreshSession && !params.has('keep'))
        || !data || data.version !== SEED_VERSION;

      if (mustSeed) {
        data = window.buildSeed(new Date());
        write(sessionStorage, USER_KEY, null);
        this.freshStart = true;
      }
      this.state = data;
      write(sessionStorage, SESSION_KEY, '1');
      this.save();

      if (params.has('reset') || params.has('keep')) {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    },

    save() {
      write(localStorage, DATA_KEY, JSON.stringify(this.state));
    },

    /** Mutate state inside fn, then persist. Returns fn's result. */
    update(fn) {
      const result = fn(this.state);
      this.save();
      return result;
    },

    /** Pick up changes written by another tab. */
    reload() {
      try {
        const data = JSON.parse(read(localStorage, DATA_KEY) || 'null');
        if (data && data.version === SEED_VERSION) this.state = data;
      } catch (e) { /* keep current state */ }
    },

    reseed() {
      this.state = window.buildSeed(new Date());
      this.save();
    },

    /** Empty everything except staff, discounts and settings. */
    clearAll() {
      this.update((s) => {
        s.menu = [];
        s.customers = [];
        s.orders = [];
        s.counters.nextOrder = 1001;
      });
    },

    get userId() { return read(sessionStorage, USER_KEY); },
    set userId(id) { write(sessionStorage, USER_KEY, id); },

    uid,
    SEED_VERSION,
    DATA_KEY,
  };

  window.Store = Store;
  window.Pricing = Pricing;
})();
