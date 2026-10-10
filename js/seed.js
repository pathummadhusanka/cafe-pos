/*
 * Default data for Hill Street Café, Kandy.
 * These are ordinary records: they can be edited or deleted like any other.
 * Timestamps are relative to "now" so the kitchen board and reports always look live.
 */
(function () {
  'use strict';

  const staff = [
    { id: 'u-nimali', name: 'Nimali Fernando', role: 'cashier', pin: '1111' },
    { id: 'u-tharindu', name: 'Tharindu Bandara', role: 'cashier', pin: '3333' },
    { id: 'u-kasun', name: 'Kasun Jayasinghe', role: 'barista', pin: '2222' },
    { id: 'u-dilini', name: 'Dilini Wickramasinghe', role: 'manager', pin: '9999' },
  ];

  const categories = ['Hot Drinks', 'Cold Drinks', 'Short Eats', 'Mains', 'Desserts'];

  // stock: null = not tracked (made to order)
  const menu = [
    { id: 'm-black-tea', name: 'Ceylon Black Tea', category: 'Hot Drinks', price: 250, stock: null, available: true },
    { id: 'm-kiri-tea', name: 'Kiri Tea (Milk Tea)', category: 'Hot Drinks', price: 300, stock: null, available: true },
    { id: 'm-ginger-tea', name: 'Ginger Tea', category: 'Hot Drinks', price: 280, stock: null, available: true },
    { id: 'm-americano', name: 'Americano', category: 'Hot Drinks', price: 600, stock: null, available: true },
    { id: 'm-cappuccino', name: 'Cappuccino', category: 'Hot Drinks', price: 750, stock: null, available: true },
    { id: 'm-latte', name: 'Café Latte', category: 'Hot Drinks', price: 800, stock: null, available: true },
    { id: 'm-iced-coffee', name: 'Iced Coffee', category: 'Cold Drinks', price: 850, stock: null, available: true },
    { id: 'm-faluda', name: 'Faluda', category: 'Cold Drinks', price: 950, stock: null, available: true },
    { id: 'm-passion', name: 'Passion Fruit Juice', category: 'Cold Drinks', price: 650, stock: null, available: true },
    { id: 'm-mango-lassi', name: 'Mango Lassi', category: 'Cold Drinks', price: 900, stock: null, available: false },
    { id: 'm-fish-bun', name: 'Fish Bun', category: 'Short Eats', price: 180, stock: 12, available: true },
    { id: 'm-egg-roll', name: 'Egg Roll', category: 'Short Eats', price: 220, stock: 8, available: true },
    { id: 'm-veg-roti', name: 'Vegetable Roti', category: 'Short Eats', price: 150, stock: 15, available: true },
    { id: 'm-chicken-patty', name: 'Chicken Patty', category: 'Short Eats', price: 200, stock: 2, available: true },
    { id: 'm-toastie', name: 'Cheese & Onion Toastie', category: 'Short Eats', price: 690, stock: null, available: true },
    { id: 'm-kottu', name: 'Chicken Kottu', category: 'Mains', price: 1450, stock: null, available: true },
    { id: 'm-fried-rice', name: 'Vegetable Fried Rice', category: 'Mains', price: 1100, stock: null, available: true },
    { id: 'm-club', name: 'Club Sandwich', category: 'Mains', price: 1250, stock: null, available: true },
    { id: 'm-string-hoppers', name: 'String Hopper Plate', category: 'Mains', price: 950, stock: null, available: true },
    { id: 'm-cbp', name: 'Chocolate Biscuit Pudding', category: 'Desserts', price: 550, stock: 3, available: true },
    { id: 'm-watalappan', name: 'Watalappan', category: 'Desserts', price: 480, stock: 0, available: true },
    { id: 'm-butter-cake', name: 'Butter Cake Slice', category: 'Desserts', price: 350, stock: 10, available: true },
  ];

  const customers = [
    { id: 'c-sajith', name: 'Sajith Rathnayake', phone: '0771234567', points: 120, joined: '2025-03-14' },
    { id: 'c-ayesha', name: 'Ayesha Perera', phone: '0712345678', points: 45, joined: '2025-07-02' },
    { id: 'c-malith', name: 'Malith Gunasekara', phone: '0759876543', points: 310, joined: '2024-11-20' },
    { id: 'c-hiruni', name: 'Hiruni de Silva', phone: '0763456789', points: 0, joined: '2026-09-28' },
    { id: 'c-ishara', name: 'Ishara Senanayake', phone: '0701122334', points: 85, joined: '2026-01-09' },
  ];

  const discounts = [
    { code: 'STUDENT10', label: 'Student – 10% off', kind: 'percent', value: 10, minSubtotal: 0 },
    { code: 'LOYAL20', label: 'Loyalty – 20% off, uses 100 points', kind: 'percent', value: 20, minSubtotal: 0, needsCustomer: true, minPoints: 100, pointsCost: 100 },
    { code: 'WELCOME500', label: 'LKR 500 off orders of LKR 2,500+', kind: 'fixed', value: 500, minSubtotal: 2500 },
  ];

  const settings = { cafeName: 'Hill Street Café', branch: 'Kandy', serviceCharge: 10 };

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const STEP_MINUTES = { preparing: 3, ready: 12, completed: 16 };
  const FLOW = ['new', 'preparing', 'ready', 'completed'];

  function makeOrder(state, spec) {
    const created = new Date(spec.at);
    const items = spec.items.map(([menuId, qty, note]) => {
      const m = state.menu.find((x) => x.id === menuId);
      return { menuId, name: m.name, price: m.price, qty, note: note || '' };
    });
    const cart = { items, type: spec.type, customerId: spec.customerId || null, discountCode: spec.code || '' };
    const p = window.Pricing.compute(cart, state);
    const customer = spec.customerId && state.customers.find((c) => c.id === spec.customerId);

    const history = [{ status: 'new', at: created.toISOString(), by: spec.cashierId }];
    if (spec.status === 'cancelled') {
      history.push({ status: 'cancelled', at: new Date(created.getTime() + 4 * 60000).toISOString(), by: 'u-dilini' });
    } else {
      FLOW.slice(1, FLOW.indexOf(spec.status) + 1).forEach((status) => {
        history.push({
          status,
          at: new Date(created.getTime() + STEP_MINUTES[status] * 60000).toISOString(),
          by: status === 'completed' ? spec.cashierId : 'u-kasun',
        });
      });
    }

    const payment = spec.method === 'cash'
      ? { method: 'cash', tendered: spec.tendered || Math.ceil(p.total / 1000) * 1000 }
      : { method: 'card', tendered: p.total };
    payment.change = payment.tendered - p.total;

    return {
      id: 'o-' + spec.number,
      number: spec.number,
      createdAt: created.toISOString(),
      type: spec.type,
      table: spec.table || '',
      customerId: spec.customerId || null,
      customerName: customer ? customer.name : (spec.guest || 'Walk-in'),
      items,
      subtotal: p.subtotal,
      discountCode: p.discountCode,
      discount: p.discount,
      serviceRate: p.serviceRate,
      service: p.service,
      total: p.total,
      payment,
      status: spec.status,
      cancelReason: spec.cancelReason || '',
      cashierId: spec.cashierId,
      pointsEarned: customer ? Math.floor(p.total / 100) : 0,
      pointsRedeemed: p.pointsCost,
      history,
    };
  }

  window.buildSeed = function buildSeed(now) {
    const state = {
      version: window.Store.SEED_VERSION,
      seededAt: now.toISOString(),
      settings: clone(settings),
      staff: clone(staff),
      categories: clone(categories),
      menu: clone(menu),
      customers: clone(customers),
      discounts: clone(discounts),
      orders: [],
      counters: { nextOrder: 1048 },
    };
    const minsAgo = (m) => new Date(now.getTime() - m * 60000);

    // Today's live orders: a believable mix across every status.
    const today = [
      { number: 1047, at: minsAgo(1), type: 'takeaway', items: [['m-chicken-patty', 1], ['m-americano', 1]], method: 'card', status: 'new', cashierId: 'u-nimali' },
      { number: 1046, at: minsAgo(4), type: 'dine-in', table: 'T1', customerId: 'c-hiruni', items: [['m-string-hoppers', 2], ['m-ginger-tea', 2, 'Less sugar']], code: 'STUDENT10', method: 'cash', tendered: 3000, status: 'new', cashierId: 'u-nimali' },
      { number: 1045, at: minsAgo(12), type: 'takeaway', guest: 'Kamal', items: [['m-cappuccino', 2, 'Extra hot'], ['m-butter-cake', 2]], method: 'cash', status: 'preparing', cashierId: 'u-tharindu' },
      { number: 1044, at: minsAgo(21), type: 'dine-in', table: 'T5', customerId: 'c-malith', items: [['m-club', 1], ['m-iced-coffee', 2]], code: 'LOYAL20', method: 'card', status: 'ready', cashierId: 'u-nimali' },
      { number: 1043, at: minsAgo(95), type: 'takeaway', customerId: 'c-ayesha', items: [['m-faluda', 1]], method: 'card', status: 'cancelled', cancelReason: 'Customer changed their mind', cashierId: 'u-tharindu' },
      { number: 1042, at: minsAgo(130), type: 'takeaway', items: [['m-fish-bun', 4], ['m-egg-roll', 2]], method: 'cash', tendered: 2000, status: 'completed', cashierId: 'u-tharindu' },
      { number: 1041, at: minsAgo(185), type: 'dine-in', table: 'T3', customerId: 'c-sajith', items: [['m-kottu', 1], ['m-kiri-tea', 2]], method: 'card', status: 'completed', cashierId: 'u-nimali' },
    ];

    // Previous six days of completed orders, deterministic so reports are stable.
    let seed = 20261010;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const sellable = menu.filter((m) => m.available).map((m) => m.id);
    const custIds = customers.map((c) => c.id).concat([null, null, null]);
    const guests = ['Ruwan', 'Chathura', 'Nadeesha', 'Pradeep', 'Sanduni', 'Walk-in'];
    const history = [];
    let number = 1040;
    for (let d = 1; d <= 6; d++) {
      const count = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < count && number > 1000; k++) {
        const at = new Date(now);
        at.setDate(at.getDate() - d);
        at.setHours(8 + Math.floor(rnd() * 11), Math.floor(rnd() * 60), 0, 0);
        const lines = 1 + Math.floor(rnd() * 3);
        const items = [];
        for (let l = 0; l < lines; l++) {
          const id = pick(sellable);
          if (!items.some((i) => i[0] === id)) items.push([id, 1 + Math.floor(rnd() * 3)]);
        }
        const dineIn = rnd() < 0.45;
        history.push({
          number: number--, at, items,
          type: dineIn ? 'dine-in' : 'takeaway',
          table: dineIn ? 'T' + (1 + Math.floor(rnd() * 8)) : '',
          customerId: pick(custIds), guest: pick(guests),
          method: rnd() < 0.55 ? 'card' : 'cash',
          status: rnd() < 0.08 ? 'cancelled' : 'completed',
          cancelReason: 'Item unavailable',
          cashierId: rnd() < 0.5 ? 'u-nimali' : 'u-tharindu',
        });
      }
    }

    state.orders = today.concat(history)
      .map((spec) => makeOrder(state, spec))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return state;
  };
})();
