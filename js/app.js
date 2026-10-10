/*
 * Hill Street Café POS – views, routing and actions.
 * Hash routes: #/pos #/kitchen #/orders #/customers #/menu #/reports #/settings
 */
(function () {
  'use strict';

  const { esc, money, clock, dateLabel, timeAgo, minutesSince, isSameDay, slug, toast, openModal, confirmDialog, showErrors } = UI;
  const S = () => Store.state;
  const app = document.getElementById('app');

  const ROLE_LABEL = { cashier: 'Cashier', barista: 'Barista', manager: 'Manager' };
  const STATUS_LABEL = { new: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
  const NEXT = { new: 'preparing', preparing: 'ready', ready: 'completed' };
  const NEXT_LABEL = { new: 'Start preparing', preparing: 'Mark ready', ready: 'Mark served' };
  const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
  const CANCEL_REASONS = ['Customer changed their mind', 'Item unavailable', 'Duplicate order', 'Payment issue', 'Other'];
  const RANGES = { today: 'Today', week: 'Last 7 days', all: 'All time' };
  const LATE_MINUTES = 15;

  const ALL_ROLES = ['cashier', 'barista', 'manager'];
  const ROUTES = {
    pos: { label: 'Register', roles: ['cashier', 'manager'], render: renderPOS },
    kitchen: { label: 'Kitchen', roles: ALL_ROLES, render: renderKitchen },
    orders: { label: 'Orders', roles: ALL_ROLES, render: renderOrders },
    customers: { label: 'Customers', roles: ['cashier', 'manager'], render: renderCustomers },
    menu: { label: 'Menu', roles: ['manager'], render: renderMenu },
    reports: { label: 'Reports', roles: ['manager'], render: renderReports },
    settings: { label: 'Settings', roles: ['manager'], render: renderSettings },
  };
  const HOME = { cashier: 'pos', barista: 'kitchen', manager: 'pos' };

  function emptyCart() {
    return { items: [], type: 'takeaway', table: '', customerId: '', guestName: '', discountCode: '', discountInput: '', discountMsg: '' };
  }

  // Transient UI state (not persisted).
  const ui = {
    cart: emptyCart(),
    pos: { category: 'All', q: '' },
    orders: { status: 'all', range: 'today', q: '' },
    menu: { category: 'All' },
    customers: { q: '' },
    reports: { range: 'today' },
  };

  // ---------- helpers ----------

  const currentUser = () => (Store.userId && S().staff.find((u) => u.id === Store.userId)) || null;
  const staffName = (id) => { const u = S().staff.find((x) => x.id === id); return u ? u.name : 'Unknown'; };
  const firstName = (name) => String(name).split(' ')[0];
  const initials = (name) => String(name).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const routeKey = () => location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  const findOrder = (id) => S().orders.find((o) => o.id === id);
  const findMenu = (id) => S().menu.find((m) => m.id === id);
  const findCustomer = (id) => S().customers.find((c) => c.id === id);
  const modalOpen = () => document.getElementById('modal-root').children.length > 0;
  const sum = (arr, fn) => arr.reduce((t, x) => t + fn(x), 0);
  const isActive = (o) => o.status === 'new' || o.status === 'preparing' || o.status === 'ready';

  function go(key) {
    if (routeKey() === key) render();
    else location.hash = '#/' + key;
  }

  function inRange(iso, range) {
    if (range === 'all') return true;
    const d = new Date(iso);
    const now = new Date();
    if (range === 'today') return isSameDay(d, now);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return d >= start;
  }

  function can(action, order) {
    const user = currentUser();
    const role = user && user.role;
    if (action === 'advance') {
      if (!NEXT[order.status]) return false;
      if (role === 'manager') return true;
      return order.status === 'ready' ? role === 'cashier' : role === 'barista';
    }
    if (action === 'cancel') return (order.status === 'new' || order.status === 'preparing') && (role === 'manager' || role === 'cashier');
    if (action === 'delete') return role === 'manager';
    return false;
  }

  function statusBadge(status) {
    return '<span class="badge status-' + status + '" data-testid="status-badge">' + STATUS_LABEL[status] + '</span>';
  }

  function orderWhere(o) {
    return o.type === 'dine-in' ? 'Dine-in · ' + esc(o.table) : 'Takeaway';
  }

  // ---------- render / routing ----------

  function render() {
    const user = currentUser();
    if (!user) return renderLogin();

    let key = routeKey();
    if (!ROUTES[key]) {
      key = HOME[user.role];
      history.replaceState(null, '', '#/' + key);
    } else if (!ROUTES[key].roles.includes(user.role)) {
      toast(ROLE_LABEL[user.role] + 's can’t open ' + ROUTES[key].label, 'error');
      key = HOME[user.role];
      history.replaceState(null, '', '#/' + key);
    }

    const st = S();
    const activeCount = st.orders.filter(isActive).length;
    const links = Object.keys(ROUTES)
      .filter((k) => ROUTES[k].roles.includes(user.role))
      .map((k) => '<a href="#/' + k + '" class="nav-link' + (k === key ? ' active" aria-current="page' : '') + '" data-testid="nav-' + k + '">' +
        ROUTES[k].label + (k === 'kitchen' && activeCount ? ' <span class="nav-count" data-testid="kitchen-count">' + activeCount + '</span>' : '') + '</a>')
      .join('');

    app.innerHTML =
      '<header class="topbar">' +
        '<div class="brand" data-testid="brand"><span class="logo" aria-hidden="true">☕</span><div><strong>' + esc(st.settings.cafeName) + '</strong><small>' + esc(st.settings.branch) + ' · Point of Sale</small></div></div>' +
        '<nav class="nav" aria-label="Main">' + links + '</nav>' +
        '<div class="user-chip" data-testid="current-user"><span class="avatar" aria-hidden="true">' + initials(user.name) + '</span>' +
          '<div><strong data-testid="current-user-name">' + esc(user.name) + '</strong><small data-testid="current-user-role">' + ROLE_LABEL[user.role] + '</small></div>' +
          '<button class="btn small ghost" data-action="logout" data-testid="logout">Switch user</button></div>' +
      '</header>' +
      '<main id="view" class="view" data-testid="view-' + key + '"></main>';

    ROUTES[key].render(document.getElementById('view'));
    document.title = ROUTES[key].label + ' · ' + st.settings.cafeName + ' POS';
  }

  // ---------- login ----------

  function renderLogin() {
    const st = S();
    document.title = 'Sign in · ' + st.settings.cafeName + ' POS';
    app.innerHTML =
      '<main class="login" data-testid="view-login">' +
        '<div class="login-card card">' +
          '<div class="brand big"><span class="logo" aria-hidden="true">☕</span><div><strong>' + esc(st.settings.cafeName) + '</strong><small>' + esc(st.settings.branch) + ' · Point of Sale</small></div></div>' +
          '<h1>Who’s on shift?</h1><p class="muted">Choose your name, then enter your 4-digit PIN.</p>' +
          '<div class="staff-grid">' + st.staff.map((u) =>
            '<button class="staff-btn" data-action="pick-staff" data-id="' + u.id + '" data-testid="login-' + slug(firstName(u.name)) + '">' +
              '<span class="avatar lg" aria-hidden="true">' + initials(u.name) + '</span><strong>' + esc(u.name) + '</strong><small>' + ROLE_LABEL[u.role] + '</small></button>').join('') +
          '</div>' +
          '<p class="login-foot muted small">Forgot your PIN? Ask the shift manager.</p>' +
        '</div>' +
      '</main>';
  }

  async function pickStaff(el) {
    const user = S().staff.find((u) => u.id === el.dataset.id);
    if (!user) return;
    const ok = await openModal({
      title: 'Sign in',
      testid: 'pin-dialog',
      size: 'sm',
      body:
        '<form novalidate><p>Signing in as <strong>' + esc(user.name) + '</strong> (' + ROLE_LABEL[user.role] + ')</p>' +
        '<label class="field"><span>PIN</span><input class="input pin" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" data-testid="pin-input"></label>' +
        '<div class="field-error" data-error-for="pin" data-testid="pin-error"></div></form>',
      actions: [
        { label: 'Cancel', value: false, testid: 'pin-cancel' },
        {
          label: 'Sign in', kind: 'primary', testid: 'pin-submit',
          onClick(modal) {
            const input = modal.querySelector('[name="pin"]');
            const pin = input.value.trim();
            if (!/^\d{4}$/.test(pin)) return showErrors(modal, { pin: 'Enter your 4-digit PIN' }) && false;
            if (pin !== user.pin) { input.value = ''; return showErrors(modal, { pin: 'Incorrect PIN. Try again.' }) && false; }
            return true;
          },
        },
      ],
    });
    if (!ok) return;
    Store.userId = user.id;
    toast('Welcome, ' + firstName(user.name) + '!');
    const key = routeKey();
    if (ROUTES[key] && ROUTES[key].roles.includes(user.role)) render();
    else go(HOME[user.role]);
  }

  async function logout() {
    if (ui.cart.items.length) {
      const ok = await confirmDialog({ title: 'Discard current order?', message: 'The open order has ' + ui.cart.items.length + ' item(s). Switching user will discard it.', confirmLabel: 'Discard & switch', danger: true });
      if (!ok) return;
    }
    Store.userId = null;
    ui.cart = emptyCart();
    history.replaceState(null, '', location.pathname);
    render();
  }

  // ---------- POS / register ----------

  function renderPOS(view) {
    const st = S();
    view.innerHTML =
      '<div class="pos">' +
        '<section class="pos-menu" aria-label="Menu">' +
          '<div class="toolbar"><input type="search" class="input grow" placeholder="Search menu…" aria-label="Search menu" value="' + esc(ui.pos.q) + '" data-bind="pos-q" data-testid="menu-search"></div>' +
          '<div class="chips" data-testid="category-filter">' + ['All'].concat(st.categories).map((c) =>
            '<button class="chip' + (c === ui.pos.category ? ' active' : '') + '" aria-pressed="' + (c === ui.pos.category) + '" data-action="pos-category" data-value="' + esc(c) + '" data-testid="category-' + slug(c) + '">' + esc(c) + '</button>').join('') +
          '</div>' +
          '<div class="menu-grid" id="menu-grid" data-testid="menu-grid"></div>' +
        '</section>' +
        '<aside class="pos-cart card" id="cart" aria-label="Current order" data-testid="cart"></aside>' +
      '</div>';
    refreshMenuGrid();
    refreshCart();
  }

  const cartLine = (menuId) => ui.cart.items.find((i) => i.menuId === menuId);

  function refreshMenuGrid() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;
    const st = S();
    if (!st.menu.length) {
      grid.innerHTML = '<p class="empty" data-testid="menu-empty">The menu is empty. A manager can add items under Menu.</p>';
      return;
    }
    const q = ui.pos.q.trim().toLowerCase();
    const items = st.menu.filter((m) => (ui.pos.category === 'All' || m.category === ui.pos.category) && (!q || m.name.toLowerCase().includes(q)));
    if (!items.length) {
      grid.innerHTML = '<p class="empty" data-testid="menu-empty">No items match “' + esc(ui.pos.q) + '”.</p>';
      return;
    }
    grid.innerHTML = items.map((m) => {
      const line = cartLine(m.id);
      const inCart = line ? line.qty : 0;
      const left = m.stock === null ? null : m.stock - inCart;
      let badge = '';
      if (!m.available) badge = '<span class="badge muted-badge">Unavailable</span>';
      else if (m.stock !== null && m.stock <= 0) badge = '<span class="badge danger-badge">Sold out</span>';
      else if (left !== null && left <= 0) badge = '<span class="badge warn-badge">All in order</span>';
      else if (left !== null && left <= 3) badge = '<span class="badge warn-badge">' + left + ' left</span>';
      const disabled = !m.available || (left !== null && left <= 0);
      return '<button class="menu-item' + (disabled ? ' disabled' : '') + '" data-action="add-item" data-id="' + m.id + '" data-testid="menu-item-' + slug(m.name) + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="mi-cat">' + esc(m.category) + '</span>' +
        '<span class="mi-name">' + esc(m.name) + '</span>' +
        '<span class="mi-foot"><span class="mi-price">' + money(m.price) + '</span>' + badge + '</span>' +
        (inCart ? '<span class="mi-count" aria-label="' + inCart + ' in order">' + inCart + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function refreshCart() {
    const el = document.getElementById('cart');
    if (!el) return;
    const st = S();
    const c = ui.cart;
    const p = Pricing.compute(c, st);
    const customers = st.customers.slice().sort((a, b) => a.name.localeCompare(b.name));

    const lines = c.items.length
      ? c.items.map((i) => {
          const m = findMenu(i.menuId);
          const atMax = m && m.stock !== null && i.qty >= m.stock;
          const s = slug(i.name);
          return '<li class="cart-line" data-testid="cart-line-' + s + '">' +
            '<div class="cl-main"><span class="cl-name">' + esc(i.name) + '</span>' +
              (i.note ? '<span class="cl-note" data-testid="note-' + s + '">“' + esc(i.note) + '”</span>' : '') +
              '<button class="link small" data-action="line-note" data-id="' + i.menuId + '" data-testid="note-btn-' + s + '">' + (i.note ? 'Edit note' : 'Add note') + '</button></div>' +
            '<div class="qty"><button class="icon-btn" data-action="qty-dec" data-id="' + i.menuId + '" aria-label="Decrease ' + esc(i.name) + '" data-testid="qty-dec-' + s + '">−</button>' +
              '<span data-testid="qty-' + s + '">' + i.qty + '</span>' +
              '<button class="icon-btn" data-action="qty-inc" data-id="' + i.menuId + '" aria-label="Increase ' + esc(i.name) + '" data-testid="qty-inc-' + s + '"' + (atMax ? ' disabled title="No more in stock"' : '') + '>+</button></div>' +
            '<span class="cl-price">' + money(i.price * i.qty) + '</span>' +
            '<button class="icon-btn subtle" data-action="remove-line" data-id="' + i.menuId + '" aria-label="Remove ' + esc(i.name) + '" data-testid="remove-' + s + '">×</button>' +
          '</li>';
        }).join('')
      : '<li class="empty" data-testid="cart-empty">Tap a menu item to start an order.</li>';

    let discountNote = '';
    if (c.discountMsg) discountNote = '<p class="field-error" data-testid="discount-error">' + esc(c.discountMsg) + '</p>';
    else if (p.discountError) discountNote = '<p class="field-error" data-testid="discount-error">' + esc(p.discountError) + ' <button class="link" data-action="remove-discount">Remove code</button></p>';
    else if (p.discountCode) discountNote = '<p class="ok-text" data-testid="discount-applied">' + esc(p.discountCode) + ' applied <button class="link" data-action="remove-discount" data-testid="remove-discount">Remove</button></p>';

    el.innerHTML =
      '<div class="cart-head"><h2>Current order</h2>' + (c.items.length ? '<button class="btn small ghost" data-action="clear-cart" data-testid="clear-cart">Clear</button>' : '') + '</div>' +
      '<div class="segmented" role="group" aria-label="Order type">' +
        '<button class="' + (c.type === 'takeaway' ? 'active' : '') + '" aria-pressed="' + (c.type === 'takeaway') + '" data-action="order-type" data-value="takeaway" data-testid="type-takeaway">Takeaway</button>' +
        '<button class="' + (c.type === 'dine-in' ? 'active' : '') + '" aria-pressed="' + (c.type === 'dine-in') + '" data-action="order-type" data-value="dine-in" data-testid="type-dine-in">Dine-in</button>' +
      '</div>' +
      (c.type === 'dine-in'
        ? '<label class="field"><span>Table</span><select class="input" id="table-select" data-bind="cart-table" data-testid="table-select"><option value="">Select table…</option>' +
            TABLES.map((t) => '<option' + (t === c.table ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>'
        : '') +
      '<label class="field"><span>Customer</span><select class="input" data-bind="cart-customer" data-testid="customer-select"><option value="">Walk-in customer</option>' +
        customers.map((cu) => '<option value="' + cu.id + '"' + (cu.id === c.customerId ? ' selected' : '') + '>' + esc(cu.name) + ' · ' + cu.points + ' pts</option>').join('') + '</select></label>' +
      (!c.customerId
        ? '<label class="field"><span>Name on order <em>(optional)</em></span><input class="input" data-bind="cart-guest" value="' + esc(c.guestName) + '" placeholder="e.g. Kamal" maxlength="40" data-testid="guest-name"></label>'
        : '') +
      '<ul class="cart-lines" data-testid="cart-lines">' + lines + '</ul>' +
      '<div class="discount-row"><input class="input grow" data-bind="cart-discount" value="' + esc(c.discountInput) + '" placeholder="Discount code" aria-label="Discount code" data-testid="discount-input">' +
        '<button class="btn" data-action="apply-discount" data-testid="apply-discount">Apply</button></div>' +
      discountNote +
      '<dl class="totals" data-testid="cart-totals">' +
        '<div><dt>Subtotal</dt><dd data-testid="subtotal">' + money(p.subtotal) + '</dd></div>' +
        (p.discount ? '<div><dt>Discount (' + esc(p.discountCode) + ')</dt><dd data-testid="discount-amount">− ' + money(p.discount) + '</dd></div>' : '') +
        (p.serviceRate ? '<div><dt>Service charge (' + p.serviceRate + '%)</dt><dd data-testid="service-charge">' + money(p.service) + '</dd></div>' : '') +
        '<div class="grand"><dt>Total</dt><dd data-testid="total">' + money(p.total) + '</dd></div>' +
      '</dl>' +
      '<button class="btn primary block lg" data-action="checkout" data-testid="checkout"' + (c.items.length ? '' : ' disabled') + '>Charge ' + money(p.total) + '</button>' +
      '<details class="codes-hint"><summary>Discount codes</summary><ul>' +
        st.discounts.map((d) => '<li><code>' + esc(d.code) + '</code> ' + esc(d.label) + '</li>').join('') + '</ul></details>';
  }

  function refreshPOS() { refreshMenuGrid(); refreshCart(); }

  function addItem(el) {
    const m = findMenu(el.dataset.id);
    if (!m || !m.available) return toast('That item is not available', 'error');
    const line = cartLine(m.id);
    const qty = line ? line.qty : 0;
    if (m.stock !== null && qty >= m.stock) return toast(m.stock ? 'Only ' + m.stock + ' × ' + m.name + ' in stock' : m.name + ' is sold out', 'error');
    if (line) line.qty += 1;
    else ui.cart.items.push({ menuId: m.id, name: m.name, price: m.price, qty: 1, note: '' });
    refreshPOS();
  }

  function changeQty(el, delta) {
    const line = cartLine(el.dataset.id);
    if (!line) return;
    const m = findMenu(line.menuId);
    if (delta > 0 && m && m.stock !== null && line.qty >= m.stock) return toast('Only ' + m.stock + ' × ' + m.name + ' in stock', 'error');
    line.qty += delta;
    if (line.qty <= 0) ui.cart.items = ui.cart.items.filter((i) => i !== line);
    refreshPOS();
  }

  function removeLine(el) {
    ui.cart.items = ui.cart.items.filter((i) => i.menuId !== el.dataset.id);
    refreshPOS();
  }

  async function editNote(el) {
    const line = cartLine(el.dataset.id);
    if (!line) return;
    const note = await openModal({
      title: 'Note for ' + line.name,
      testid: 'note-dialog',
      size: 'sm',
      body: '<form><label class="field"><span>Kitchen note</span><textarea class="input" name="note" rows="3" maxlength="80" placeholder="e.g. Less sugar, no onions" data-testid="note-input">' + esc(line.note) + '</textarea></label></form>',
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Save note', kind: 'primary', testid: 'note-save', onClick: (modal) => modal.querySelector('[name="note"]').value.trim() },
      ],
    });
    if (note === null) return;
    line.note = note;
    refreshCart();
  }

  async function clearCart() {
    const ok = await confirmDialog({ title: 'Clear order?', message: 'Remove all items from the current order?', confirmLabel: 'Clear order', danger: true });
    if (!ok) return;
    ui.cart = emptyCart();
    refreshPOS();
  }

  function setOrderType(el) {
    ui.cart.type = el.dataset.value;
    if (ui.cart.type === 'takeaway') ui.cart.table = '';
    refreshCart();
  }

  function applyDiscount() {
    const c = ui.cart;
    const code = c.discountInput.trim().toUpperCase();
    c.discountMsg = '';
    if (!code) { c.discountMsg = 'Enter a discount code'; return refreshCart(); }
    const p = Pricing.compute(Object.assign({}, c, { discountCode: code }), S());
    if (p.discountError) {
      c.discountCode = '';
      c.discountMsg = p.discountError;
    } else {
      c.discountCode = code;
      c.discountInput = code;
      toast(code + ' applied: −' + money(p.discount));
    }
    refreshCart();
  }

  function removeDiscount() {
    Object.assign(ui.cart, { discountCode: '', discountInput: '', discountMsg: '' });
    refreshCart();
  }

  function stockProblem(items) {
    for (const i of items) {
      const m = findMenu(i.menuId);
      if (!m) return i.name + ' was removed from the menu';
      if (!m.available) return i.name + ' is no longer available';
      if (m.stock !== null && m.stock < i.qty) return 'Only ' + m.stock + ' × ' + m.name + ' left in stock';
    }
    return null;
  }

  async function checkout() {
    const c = ui.cart;
    if (!c.items.length) return toast('Add at least one item first', 'error');
    if (c.type === 'dine-in' && !c.table) {
      toast('Choose a table for dine-in orders', 'error');
      const sel = document.getElementById('table-select');
      if (sel) sel.focus();
      return;
    }
    const p = Pricing.compute(c, S());
    if (p.discountError) return toast(p.discountError, 'error');
    const problem = stockProblem(c.items);
    if (problem) return toast(problem, 'error');

    const payment = await paymentDialog(p.total);
    if (!payment) return;

    const order = placeOrder(payment);
    ui.cart = emptyCart();
    render();
    toast('Order #' + order.number + ' sent to the kitchen');
    showReceipt(order, 'New order');
  }

  function paymentDialog(total) {
    const quick = [total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000]
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return openModal({
      title: 'Take payment',
      testid: 'payment-dialog',
      size: 'sm',
      body:
        '<form novalidate class="pay">' +
          '<div class="pay-total"><span>Amount due</span><strong data-testid="amount-due">' + money(total) + '</strong></div>' +
          '<div class="segmented radios" role="radiogroup" aria-label="Payment method">' +
            '<label><input type="radio" name="method" value="card" checked data-testid="pay-card"> Card</label>' +
            '<label><input type="radio" name="method" value="cash" data-testid="pay-cash"> Cash</label>' +
          '</div>' +
          '<div class="cash-fields" hidden>' +
            '<label class="field"><span>Cash received (LKR)</span><input class="input" name="tendered" type="number" min="0" step="10" inputmode="numeric" data-testid="cash-tendered"></label>' +
            '<div class="chips">' + quick.map((v) => '<button type="button" class="chip" data-cash="' + v + '" data-testid="quick-cash-' + v + '">' + (v === total ? 'Exact' : money(v)) + '</button>').join('') + '</div>' +
            '<div class="field-error" data-error-for="tendered" data-testid="cash-error"></div>' +
            '<p class="change">Change due: <strong data-testid="change-due">' + money(0) + '</strong></p>' +
          '</div>' +
        '</form>',
      onMount(modal) {
        const cash = modal.querySelector('.cash-fields');
        const tendered = modal.querySelector('[name="tendered"]');
        const change = modal.querySelector('[data-testid="change-due"]');
        const updateChange = () => { change.textContent = money(Math.max(0, (Number(tendered.value) || 0) - total)); };
        modal.querySelectorAll('[name="method"]').forEach((r) => r.addEventListener('change', () => {
          cash.hidden = r.value !== 'cash' || !r.checked;
          if (!cash.hidden) tendered.focus();
        }));
        tendered.addEventListener('input', updateChange);
        modal.querySelectorAll('[data-cash]').forEach((b) => b.addEventListener('click', () => { tendered.value = b.dataset.cash; updateChange(); }));
      },
      actions: [
        { label: 'Back', value: null, testid: 'payment-cancel' },
        {
          label: 'Confirm payment', kind: 'primary', testid: 'payment-confirm',
          onClick(modal) {
            const method = modal.querySelector('[name="method"]:checked').value;
            if (method === 'card') return { method: 'card', tendered: total, change: 0 };
            const raw = modal.querySelector('[name="tendered"]').value;
            const amount = Number(raw);
            if (raw === '' || !Number.isFinite(amount)) return showErrors(modal, { tendered: 'Enter the cash amount received' }) && false;
            if (amount < total) return showErrors(modal, { tendered: 'Cash received is less than ' + money(total) }) && false;
            return { method: 'cash', tendered: amount, change: amount - total };
          },
        },
      ],
    });
  }

  function placeOrder(payment) {
    const user = currentUser();
    const c = ui.cart;
    return Store.update((st) => {
      const p = Pricing.compute(c, st);
      const customer = c.customerId ? findCustomer(c.customerId) : null;
      const now = new Date().toISOString();
      const order = {
        id: Store.uid('o'),
        number: st.counters.nextOrder++,
        createdAt: now,
        type: c.type,
        table: c.type === 'dine-in' ? c.table : '',
        customerId: customer ? customer.id : null,
        customerName: customer ? customer.name : (c.guestName.trim() || 'Walk-in'),
        items: c.items.map((i) => Object.assign({}, i)),
        subtotal: p.subtotal,
        discountCode: p.discountCode,
        discount: p.discount,
        serviceRate: p.serviceRate,
        service: p.service,
        total: p.total,
        payment,
        status: 'new',
        cancelReason: '',
        cashierId: user.id,
        pointsEarned: customer ? Math.floor(p.total / 100) : 0,
        pointsRedeemed: customer ? p.pointsCost : 0,
        history: [{ status: 'new', at: now, by: user.id }],
      };
      order.items.forEach((i) => {
        const m = findMenu(i.menuId);
        if (m && m.stock !== null) m.stock = Math.max(0, m.stock - i.qty);
      });
      if (customer) customer.points = Math.max(0, customer.points - order.pointsRedeemed + order.pointsEarned);
      st.orders.unshift(order);
      return order;
    });
  }

  function showReceipt(order, primaryLabel) {
    const st = S();
    return openModal({
      title: 'Receipt #' + order.number,
      testid: 'receipt-dialog',
      size: 'sm',
      body:
        '<div class="receipt" data-testid="receipt">' +
          '<div class="r-head"><strong>' + esc(st.settings.cafeName) + '</strong><small>' + esc(st.settings.branch) + '</small>' +
          '<small>Order #' + order.number + ' · ' + dateLabel(order.createdAt) + ' ' + clock(order.createdAt) + '</small>' +
          '<small>' + orderWhere(order) + ' · ' + esc(order.customerName) + '</small></div>' +
          '<table class="r-items">' + order.items.map((i) => '<tr><td>' + i.qty + ' × ' + esc(i.name) + '</td><td class="num">' + money(i.qty * i.price) + '</td></tr>').join('') + '</table>' +
          '<table class="r-totals">' +
            '<tr><td>Subtotal</td><td class="num">' + money(order.subtotal) + '</td></tr>' +
            (order.discount ? '<tr><td>Discount ' + esc(order.discountCode) + '</td><td class="num">− ' + money(order.discount) + '</td></tr>' : '') +
            (order.service ? '<tr><td>Service charge ' + order.serviceRate + '%</td><td class="num">' + money(order.service) + '</td></tr>' : '') +
            '<tr class="grand"><td>Total</td><td class="num" data-testid="receipt-total">' + money(order.total) + '</td></tr>' +
            '<tr><td>Paid by ' + order.payment.method + '</td><td class="num">' + money(order.payment.tendered) + '</td></tr>' +
            (order.payment.method === 'cash' ? '<tr><td>Change</td><td class="num" data-testid="receipt-change">' + money(order.payment.change) + '</td></tr>' : '') +
          '</table>' +
          (order.pointsEarned || order.pointsRedeemed ? '<p class="r-points">Loyalty: +' + order.pointsEarned + ' points' + (order.pointsRedeemed ? ', −' + order.pointsRedeemed + ' redeemed' : '') + '</p>' : '') +
          '<p class="r-foot">Served by ' + esc(firstName(staffName(order.cashierId))) + ' · Thank you, come again!</p>' +
        '</div>',
      actions: [{ label: primaryLabel || 'Close', kind: 'primary', value: null, testid: 'receipt-close' }],
    });
  }

  // ---------- kitchen ----------

  function renderKitchen(view) {
    const active = S().orders.filter(isActive).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const columns = [['new', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready for pickup']];
    view.innerHTML =
      '<div class="page-head"><div><h1>Kitchen board</h1><p class="muted">' + active.length + ' active order' + (active.length === 1 ? '' : 's') + ' · tickets waiting ' + LATE_MINUTES + '+ min are flagged</p></div></div>' +
      '<div class="board">' + columns.map(([status, label]) => {
        const list = active.filter((o) => o.status === status);
        return '<section class="column col-' + status + '" aria-label="' + label + '" data-testid="column-' + status + '">' +
          '<h2>' + label + ' <span class="count">' + list.length + '</span></h2>' +
          (list.length ? list.map(ticket).join('') : '<p class="empty">Nothing here</p>') +
        '</section>';
      }).join('') + '</div>';
  }

  function ticket(o) {
    const mins = minutesSince(o.createdAt);
    const late = o.status !== 'ready' && mins >= LATE_MINUTES;
    let action = '';
    if (can('advance', o)) action = '<button class="btn small primary" data-action="advance" data-id="' + o.id + '" data-testid="advance-' + o.number + '">' + NEXT_LABEL[o.status] + '</button>';
    else if (o.status === 'ready') action = '<span class="muted small">Waiting for cashier</span>';
    return '<article class="ticket' + (late ? ' late' : '') + '" data-testid="ticket-' + o.number + '">' +
      '<header><strong>#' + o.number + '</strong><span class="muted">' + orderWhere(o) + '</span>' +
        '<span class="elapsed' + (late ? ' late' : '') + '" title="Ordered at ' + clock(o.createdAt) + '">' + mins + ' min</span></header>' +
      '<p class="t-cust">' + esc(o.customerName) + '</p>' +
      '<ul>' + o.items.map((i) => '<li><b>' + i.qty + '×</b> ' + esc(i.name) + (i.note ? '<em>' + esc(i.note) + '</em>' : '') + '</li>').join('') + '</ul>' +
      '<footer>' + action + '<button class="btn small ghost" data-action="view-order" data-id="' + o.id + '" data-testid="view-' + o.number + '">Details</button></footer>' +
    '</article>';
  }

  function advanceOrder(id) {
    const o = findOrder(id);
    const user = currentUser();
    if (!o) return;
    if (!can('advance', o)) return toast('You don’t have permission to do that', 'error');
    const next = NEXT[o.status];
    Store.update(() => {
      o.status = next;
      o.history.push({ status: next, at: new Date().toISOString(), by: user.id });
    });
    toast('Order #' + o.number + ' → ' + STATUS_LABEL[next]);
    render();
  }

  // ---------- orders ----------

  function renderOrders(view) {
    const f = ui.orders;
    view.innerHTML =
      '<div class="page-head"><div><h1>Orders</h1><p class="muted" id="orders-summary" data-testid="orders-summary"></p></div></div>' +
      '<div class="toolbar">' +
        '<input type="search" class="input grow" placeholder="Search by order # or customer" aria-label="Search orders" value="' + esc(f.q) + '" data-bind="orders-q" data-testid="orders-search">' +
        '<select class="input" aria-label="Status" data-bind="orders-status" data-testid="orders-status-filter"><option value="all">All statuses</option>' +
          Object.keys(STATUS_LABEL).map((s) => '<option value="' + s + '"' + (s === f.status ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>').join('') + '</select>' +
        '<select class="input" aria-label="Date range" data-bind="orders-range" data-testid="orders-range-filter">' +
          Object.keys(RANGES).map((r) => '<option value="' + r + '"' + (r === f.range ? ' selected' : '') + '>' + RANGES[r] + '</option>').join('') + '</select>' +
      '</div>' +
      '<div class="card table-wrap"><table class="table" data-testid="orders-table"><thead><tr>' +
        '<th>Order</th><th>Time</th><th>Customer</th><th>Type</th><th class="num">Items</th><th class="num">Total</th><th>Status</th><th>Cashier</th>' +
      '</tr></thead><tbody id="orders-body"></tbody></table></div>';
    refreshOrders();
  }

  function refreshOrders() {
    const body = document.getElementById('orders-body');
    if (!body) return;
    const f = ui.orders;
    const q = f.q.trim().toLowerCase().replace(/^#/, '');
    const list = S().orders.filter((o) =>
      (f.status === 'all' || o.status === f.status) &&
      inRange(o.createdAt, f.range) &&
      (!q || String(o.number).includes(q) || o.customerName.toLowerCase().includes(q)));

    body.innerHTML = list.length
      ? list.map((o) =>
          '<tr data-testid="order-row-' + o.number + '">' +
            '<td><button class="link strong" data-action="view-order" data-id="' + o.id + '" data-testid="open-order-' + o.number + '">#' + o.number + '</button></td>' +
            '<td>' + (f.range === 'today' ? '' : dateLabel(o.createdAt) + ' ') + clock(o.createdAt) + '</td>' +
            '<td>' + esc(o.customerName) + '</td>' +
            '<td>' + orderWhere(o) + '</td>' +
            '<td class="num">' + sum(o.items, (i) => i.qty) + '</td>' +
            '<td class="num">' + money(o.total) + '</td>' +
            '<td>' + statusBadge(o.status) + '</td>' +
            '<td>' + esc(firstName(staffName(o.cashierId))) + '</td>' +
          '</tr>').join('')
      : '<tr><td colspan="8" class="empty" data-testid="orders-empty">No orders match these filters.</td></tr>';

    const valid = list.filter((o) => o.status !== 'cancelled');
    document.getElementById('orders-summary').textContent =
      list.length + ' order' + (list.length === 1 ? '' : 's') + ' · ' + money(sum(valid, (o) => o.total)) + ' in sales';
  }

  async function viewOrder(id) {
    const o = findOrder(id);
    if (!o) return toast('That order no longer exists', 'error');
    const actions = [];
    if (can('delete', o)) actions.push({ label: 'Delete', value: 'delete', kind: 'ghost danger-text', testid: 'order-delete' });
    if (can('cancel', o)) actions.push({ label: 'Cancel order', value: 'cancel', kind: 'danger-outline', testid: 'order-cancel' });
    actions.push({ label: 'Receipt', value: 'receipt', testid: 'order-receipt' });
    if (can('advance', o)) actions.push({ label: NEXT_LABEL[o.status], value: 'advance', kind: 'primary', testid: 'order-advance' });
    else actions.push({ label: 'Close', value: null, kind: 'primary', testid: 'order-close' });

    const result = await openModal({
      title: 'Order #' + o.number,
      testid: 'order-dialog',
      body:
        '<div class="order-meta">' +
          '<div><span>Status</span>' + statusBadge(o.status) + '</div>' +
          '<div><span>Placed</span>' + dateLabel(o.createdAt) + ', ' + clock(o.createdAt) + '</div>' +
          '<div><span>Customer</span>' + esc(o.customerName) + '</div>' +
          '<div><span>Type</span>' + orderWhere(o) + '</div>' +
          '<div><span>Cashier</span>' + esc(staffName(o.cashierId)) + '</div>' +
          '<div><span>Payment</span>' + (o.payment.method === 'cash' ? 'Cash' : 'Card') + '</div>' +
        '</div>' +
        (o.status === 'cancelled' ? '<p class="alert danger" data-testid="cancel-reason">Cancelled: ' + esc(o.cancelReason) + '</p>' : '') +
        '<table class="table compact"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>' +
          o.items.map((i) => '<tr><td>' + esc(i.name) + (i.note ? '<div class="muted small">“' + esc(i.note) + '”</div>' : '') + '</td><td class="num">' + i.qty + '</td><td class="num">' + money(i.qty * i.price) + '</td></tr>').join('') +
        '</tbody><tfoot>' +
          (o.discount ? '<tr><td colspan="2">Discount ' + esc(o.discountCode) + '</td><td class="num">− ' + money(o.discount) + '</td></tr>' : '') +
          (o.service ? '<tr><td colspan="2">Service charge ' + o.serviceRate + '%</td><td class="num">' + money(o.service) + '</td></tr>' : '') +
          '<tr class="grand"><td colspan="2">Total</td><td class="num">' + money(o.total) + '</td></tr>' +
        '</tfoot></table>' +
        '<h3 class="section-title">Timeline</h3><ol class="timeline" data-testid="order-timeline">' +
          o.history.map((h) => '<li><strong>' + STATUS_LABEL[h.status] + '</strong> · ' + clock(h.at) + ' · ' + esc(firstName(staffName(h.by))) + '</li>').join('') +
        '</ol>',
      actions,
    });

    if (result === 'advance') advanceOrder(o.id);
    else if (result === 'cancel') cancelOrder(o);
    else if (result === 'delete') deleteOrder(o);
    else if (result === 'receipt') showReceipt(o);
  }

  async function cancelOrder(o) {
    const reason = await openModal({
      title: 'Cancel order #' + o.number,
      testid: 'cancel-dialog',
      size: 'sm',
      body:
        '<form novalidate><p class="muted">Stock and loyalty points from this order will be restored.</p>' +
          '<label class="field"><span>Reason</span><select class="input" name="reason" data-testid="cancel-reason-select"><option value="">Select a reason…</option>' +
            CANCEL_REASONS.map((r) => '<option>' + r + '</option>').join('') + '</select></label>' +
          '<div class="field-error" data-error-for="reason"></div>' +
          '<label class="field"><span>Details <em>(required for “Other”)</em></span><input class="input" name="details" maxlength="80" data-testid="cancel-details"></label>' +
          '<div class="field-error" data-error-for="details"></div>' +
        '</form>',
      actions: [
        { label: 'Keep order', value: null, testid: 'cancel-keep' },
        {
          label: 'Cancel order', kind: 'danger', testid: 'cancel-confirm',
          onClick(modal) {
            const r = modal.querySelector('[name="reason"]').value;
            const details = modal.querySelector('[name="details"]').value.trim();
            const errors = {};
            if (!r) errors.reason = 'Choose a reason';
            else if (r === 'Other' && details.length < 3) errors.details = 'Describe the reason (3+ characters)';
            if (!showErrors(modal, errors)) return false;
            return r === 'Other' ? details : (details ? r + ' – ' + details : r);
          },
        },
      ],
    });
    if (!reason) return;
    const user = currentUser();
    Store.update(() => {
      o.status = 'cancelled';
      o.cancelReason = reason;
      o.history.push({ status: 'cancelled', at: new Date().toISOString(), by: user.id });
      o.items.forEach((i) => {
        const m = findMenu(i.menuId);
        if (m && m.stock !== null) m.stock += i.qty;
      });
      const customer = o.customerId && findCustomer(o.customerId);
      if (customer) customer.points = Math.max(0, customer.points - o.pointsEarned + o.pointsRedeemed);
    });
    toast('Order #' + o.number + ' cancelled. Stock restored.');
    render();
  }

  async function deleteOrder(o) {
    const ok = await confirmDialog({
      title: 'Delete order #' + o.number + '?',
      message: 'This permanently removes the order from history and reports. Stock and loyalty points are not changed.',
      confirmLabel: 'Delete order',
      danger: true,
    });
    if (!ok) return;
    Store.update((st) => { st.orders = st.orders.filter((x) => x.id !== o.id); });
    toast('Order #' + o.number + ' deleted');
    render();
  }

  // ---------- customers ----------

  function renderCustomers(view) {
    view.innerHTML =
      '<div class="page-head"><div><h1>Customers</h1><p class="muted">Loyalty members earn 1 point per LKR 100 spent.</p></div>' +
        '<button class="btn primary" data-action="add-customer" data-testid="add-customer">+ Add customer</button></div>' +
      '<div class="toolbar"><input type="search" class="input grow" placeholder="Search by name or phone" aria-label="Search customers" value="' + esc(ui.customers.q) + '" data-bind="customers-q" data-testid="customers-search"></div>' +
      '<div class="card table-wrap"><table class="table" data-testid="customers-table"><thead><tr>' +
        '<th>Name</th><th>Phone</th><th class="num">Points</th><th class="num">Orders</th><th>Last visit</th><th></th>' +
      '</tr></thead><tbody id="customers-body"></tbody></table></div>';
    refreshCustomers();
  }

  function refreshCustomers() {
    const body = document.getElementById('customers-body');
    if (!body) return;
    const q = ui.customers.q.trim().toLowerCase();
    const orders = S().orders;
    const list = S().customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    body.innerHTML = list.length
      ? list.map((c) => {
          const theirs = orders.filter((o) => o.customerId === c.id);
          const s = slug(c.name);
          return '<tr data-testid="customer-row-' + s + '">' +
            '<td class="strong">' + esc(c.name) + '</td><td>' + esc(c.phone) + '</td>' +
            '<td class="num">' + c.points + '</td><td class="num">' + theirs.length + '</td>' +
            '<td>' + (theirs.length ? timeAgo(theirs[0].createdAt) : '—') + '</td>' +
            '<td class="row-actions"><button class="btn small ghost" data-action="edit-customer" data-id="' + c.id + '" data-testid="edit-customer-' + s + '">Edit</button>' +
              '<button class="btn small ghost danger-text" data-action="delete-customer" data-id="' + c.id + '" data-testid="delete-customer-' + s + '">Delete</button></td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty" data-testid="customers-empty">' + (q ? 'No customers match “' + esc(ui.customers.q) + '”.' : 'No customers yet.') + '</td></tr>';
  }

  async function customerForm(existing) {
    const isManager = currentUser().role === 'manager';
    const c = existing || { name: '', phone: '', points: 0 };
    const data = await openModal({
      title: existing ? 'Edit customer' : 'Add customer',
      testid: 'customer-dialog',
      size: 'sm',
      body:
        '<form novalidate>' +
          '<label class="field"><span>Full name</span><input class="input" name="name" maxlength="50" value="' + esc(c.name) + '" data-testid="customer-name"></label><div class="field-error" data-error-for="name"></div>' +
          '<label class="field"><span>Mobile number</span><input class="input" name="phone" maxlength="10" inputmode="numeric" placeholder="07XXXXXXXX" value="' + esc(c.phone) + '" data-testid="customer-phone"></label><div class="field-error" data-error-for="phone"></div>' +
          '<label class="field"><span>Loyalty points' + (isManager ? '' : ' <em>(manager only)</em>') + '</span><input class="input" name="points" type="number" min="0" value="' + c.points + '"' + (isManager ? '' : ' readonly') + ' data-testid="customer-points"></label><div class="field-error" data-error-for="points"></div>' +
        '</form>',
      actions: [
        { label: 'Cancel', value: null },
        {
          label: existing ? 'Save changes' : 'Add customer', kind: 'primary', testid: 'customer-save',
          onClick(modal) {
            const name = modal.querySelector('[name="name"]').value.trim().replace(/\s+/g, ' ');
            const phone = modal.querySelector('[name="phone"]').value.trim();
            const pointsRaw = modal.querySelector('[name="points"]').value;
            const points = Number(pointsRaw);
            const errors = {};
            if (name.length < 2) errors.name = 'Enter the customer’s name';
            if (!/^07\d{8}$/.test(phone)) errors.phone = 'Use a 10-digit mobile number starting with 07';
            else if (S().customers.some((x) => x.phone === phone && x !== existing)) errors.phone = 'Another customer already uses this number';
            if (!Number.isInteger(points) || points < 0 || pointsRaw === '') errors.points = 'Points must be a whole number, 0 or more';
            return showErrors(modal, errors) ? { name, phone, points } : false;
          },
        },
      ],
    });
    if (!data) return;
    Store.update((st) => {
      if (existing) {
        Object.assign(existing, data);
        st.orders.forEach((o) => { if (o.customerId === existing.id) o.customerName = data.name; });
      } else {
        st.customers.push(Object.assign({ id: Store.uid('c'), joined: new Date().toISOString().slice(0, 10) }, data));
      }
    });
    toast(existing ? 'Saved ' + data.name : data.name + ' added to loyalty');
    render();
  }

  async function deleteCustomer(id) {
    const c = findCustomer(id);
    if (!c) return;
    const ok = await confirmDialog({ title: 'Delete ' + c.name + '?', message: 'Their ' + c.points + ' loyalty points will be lost. Past orders keep the customer’s name.', confirmLabel: 'Delete customer', danger: true });
    if (!ok) return;
    Store.update((st) => {
      st.customers = st.customers.filter((x) => x.id !== id);
      st.orders.forEach((o) => { if (o.customerId === id) o.customerId = null; });
    });
    if (ui.cart.customerId === id) ui.cart.customerId = '';
    toast(c.name + ' deleted');
    render();
  }

  // ---------- menu management ----------

  function renderMenu(view) {
    const st = S();
    const cat = ui.menu.category;
    const list = st.menu.filter((m) => cat === 'All' || m.category === cat);
    view.innerHTML =
      '<div class="page-head"><div><h1>Menu</h1><p class="muted">' + st.menu.length + ' items · ' + st.menu.filter((m) => !m.available || m.stock === 0).length + ' not sellable right now</p></div>' +
        '<button class="btn primary" data-action="add-menu-item" data-testid="add-menu-item">+ Add item</button></div>' +
      '<div class="toolbar"><select class="input" aria-label="Category" data-bind="menu-category" data-testid="menu-category-filter">' +
        ['All'].concat(st.categories).map((c) => '<option' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="card table-wrap"><table class="table" data-testid="menu-table"><thead><tr>' +
        '<th>Item</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Available</th><th></th>' +
      '</tr></thead><tbody>' +
      (list.length
        ? list.map((m) => {
            const s = slug(m.name);
            return '<tr data-testid="menu-row-' + s + '">' +
              '<td class="strong">' + esc(m.name) + '</td><td>' + esc(m.category) + '</td><td class="num">' + money(m.price) + '</td>' +
              '<td class="num">' + (m.stock === null ? '<span class="muted">Not tracked</span>' : (m.stock === 0 ? '<span class="badge danger-badge">0</span>' : m.stock)) + '</td>' +
              '<td><label class="switch"><input type="checkbox" data-action="toggle-available" data-id="' + m.id + '"' + (m.available ? ' checked' : '') + ' data-testid="available-' + s + '" aria-label="' + esc(m.name) + ' available"><span></span></label></td>' +
              '<td class="row-actions"><button class="btn small ghost" data-action="edit-menu-item" data-id="' + m.id + '" data-testid="edit-item-' + s + '">Edit</button>' +
                '<button class="btn small ghost danger-text" data-action="delete-menu-item" data-id="' + m.id + '" data-testid="delete-item-' + s + '">Delete</button></td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="6" class="empty">No items in this category.</td></tr>') +
      '</tbody></table></div>';
  }

  async function menuForm(existing) {
    const st = S();
    const m = existing || { name: '', category: ui.menu.category !== 'All' ? ui.menu.category : st.categories[0], price: '', stock: null, available: true };
    const data = await openModal({
      title: existing ? 'Edit ' + existing.name : 'Add menu item',
      testid: 'menu-item-dialog',
      size: 'sm',
      body:
        '<form novalidate>' +
          '<label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="' + esc(m.name) + '" data-testid="item-name"></label><div class="field-error" data-error-for="name"></div>' +
          '<label class="field"><span>Category</span><select class="input" name="category" data-testid="item-category">' +
            st.categories.map((c) => '<option' + (c === m.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
          '<label class="field"><span>Price (LKR)</span><input class="input" name="price" type="number" min="1" step="10" value="' + esc(m.price) + '" data-testid="item-price"></label><div class="field-error" data-error-for="price"></div>' +
          '<label class="field"><span>Stock <em>(leave blank if made to order)</em></span><input class="input" name="stock" type="number" min="0" value="' + (m.stock === null ? '' : m.stock) + '" data-testid="item-stock"></label><div class="field-error" data-error-for="stock"></div>' +
          '<label class="check"><input type="checkbox" name="available"' + (m.available ? ' checked' : '') + ' data-testid="item-available"> Available for sale</label>' +
        '</form>',
      actions: [
        { label: 'Cancel', value: null },
        {
          label: existing ? 'Save changes' : 'Add item', kind: 'primary', testid: 'item-save',
          onClick(modal) {
            const val = (n) => modal.querySelector('[name="' + n + '"]').value.trim();
            const name = val('name').replace(/\s+/g, ' ');
            const price = Number(val('price'));
            const stockRaw = val('stock');
            const stock = stockRaw === '' ? null : Number(stockRaw);
            const errors = {};
            if (name.length < 2) errors.name = 'Enter an item name';
            else if (S().menu.some((x) => x.name.toLowerCase() === name.toLowerCase() && x !== existing)) errors.name = 'An item with this name already exists';
            if (!Number.isInteger(price) || price <= 0) errors.price = 'Price must be a whole number above 0';
            else if (price > 100000) errors.price = 'Price looks too high (max LKR 100,000)';
            if (stock !== null && (!Number.isInteger(stock) || stock < 0)) errors.stock = 'Stock must be a whole number, 0 or more';
            if (!showErrors(modal, errors)) return false;
            return { name, category: val('category'), price, stock, available: modal.querySelector('[name="available"]').checked };
          },
        },
      ],
    });
    if (!data) return;
    Store.update((s) => {
      if (existing) Object.assign(existing, data);
      else s.menu.push(Object.assign({ id: Store.uid('m') }, data));
    });
    toast(existing ? data.name + ' updated' : data.name + ' added to the menu');
    render();
  }

  function toggleAvailable(el) {
    const m = findMenu(el.dataset.id);
    if (!m) return;
    Store.update(() => { m.available = el.checked; });
    toast(m.name + (m.available ? ' is now available' : ' marked unavailable'), m.available ? 'success' : 'info');
    render();
  }

  async function deleteMenuItem(id) {
    const m = findMenu(id);
    if (!m) return;
    const ok = await confirmDialog({ title: 'Delete ' + m.name + '?', message: 'It will be removed from the menu. Past orders keep their line items.', confirmLabel: 'Delete item', danger: true });
    if (!ok) return;
    Store.update((st) => { st.menu = st.menu.filter((x) => x.id !== id); });
    ui.cart.items = ui.cart.items.filter((i) => i.menuId !== id);
    toast(m.name + ' deleted');
    render();
  }

  // ---------- reports ----------

  function bars(rows, format) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    if (!rows.length) return '<p class="empty">No sales in this period.</p>';
    return '<div class="bars">' + rows.map((r) =>
      '<div class="bar-row"><span class="bar-label">' + esc(r.label) + '</span>' +
      '<div class="bar-track"><div class="bar" style="width:' + Math.round(r.value / max * 100) + '%"></div></div>' +
      '<span class="bar-value">' + format(r) + '</span></div>').join('') + '</div>';
  }

  function renderReports(view) {
    const range = ui.reports.range;
    const all = S().orders;
    const orders = all.filter((o) => inRange(o.createdAt, range));
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const revenue = sum(valid, (o) => o.total);

    const itemMap = {};
    valid.forEach((o) => o.items.forEach((i) => {
      const row = itemMap[i.name] || (itemMap[i.name] = { label: i.name, value: 0, revenue: 0 });
      row.value += i.qty;
      row.revenue += i.qty * i.price;
    }));
    const top = Object.values(itemMap).sort((a, b) => b.value - a.value || b.revenue - a.revenue).slice(0, 5);

    const pay = ['card', 'cash'].map((method) => ({ label: method === 'card' ? 'Card' : 'Cash', value: sum(valid.filter((o) => o.payment.method === method), (o) => o.total) }));

    const days = [];
    for (let d = 6; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      days.push({ label: d === 0 ? 'Today' : day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), value: sum(all.filter((o) => o.status !== 'cancelled' && isSameDay(new Date(o.createdAt), day)), (o) => o.total) });
    }

    const staffRows = S().staff.filter((u) => u.role !== 'barista').map((u) => {
      const theirs = valid.filter((o) => o.cashierId === u.id);
      return { label: u.name, value: sum(theirs, (o) => o.total), count: theirs.length };
    }).filter((r) => r.count);

    view.innerHTML =
      '<div class="page-head"><div><h1>Reports</h1><p class="muted">Cancelled orders are excluded from sales.</p></div>' +
        '<select class="input" aria-label="Report period" data-bind="reports-range" data-testid="reports-range">' +
          Object.keys(RANGES).map((r) => '<option value="' + r + '"' + (r === range ? ' selected' : '') + '>' + RANGES[r] + '</option>').join('') + '</select></div>' +
      '<div class="kpis">' +
        '<div class="kpi card" data-testid="kpi-revenue"><span>Sales</span><strong>' + money(revenue) + '</strong></div>' +
        '<div class="kpi card" data-testid="kpi-orders"><span>Orders</span><strong>' + valid.length + '</strong></div>' +
        '<div class="kpi card" data-testid="kpi-average"><span>Average order</span><strong>' + money(valid.length ? Math.round(revenue / valid.length) : 0) + '</strong></div>' +
        '<div class="kpi card" data-testid="kpi-cancelled"><span>Cancelled</span><strong>' + (orders.length - valid.length) + '</strong></div>' +
      '</div>' +
      '<div class="report-grid">' +
        '<section class="card pad" data-testid="report-top-items"><h2>Top items</h2>' + bars(top, (r) => r.value + ' sold') + '</section>' +
        '<section class="card pad" data-testid="report-payments"><h2>Payment methods</h2>' + bars(revenue ? pay : [], (r) => money(r.value)) + '</section>' +
        '<section class="card pad" data-testid="report-daily"><h2>Daily sales · last 7 days</h2>' + bars(days, (r) => money(r.value)) + '</section>' +
        '<section class="card pad" data-testid="report-staff"><h2>Sales by cashier</h2>' + bars(staffRows, (r) => money(r.value) + ' · ' + r.count) + '</section>' +
      '</div>';
  }

  // ---------- settings ----------

  function renderSettings(view) {
    const st = S();
    view.innerHTML =
      '<div class="page-head"><div><h1>Settings</h1></div></div>' +
      '<div class="settings-grid">' +
        '<section class="card pad"><h2>Café details</h2><form id="settings-form" novalidate>' +
          '<label class="field"><span>Café name</span><input class="input" name="cafeName" maxlength="40" value="' + esc(st.settings.cafeName) + '" data-testid="setting-name"></label><div class="field-error" data-error-for="cafeName"></div>' +
          '<label class="field"><span>Branch</span><input class="input" name="branch" maxlength="30" value="' + esc(st.settings.branch) + '" data-testid="setting-branch"></label><div class="field-error" data-error-for="branch"></div>' +
          '<label class="field"><span>Dine-in service charge (%)</span><input class="input" name="serviceCharge" type="number" min="0" max="25" value="' + st.settings.serviceCharge + '" data-testid="setting-service"></label><div class="field-error" data-error-for="serviceCharge"></div>' +
          '<button class="btn primary" data-action="save-settings" data-testid="save-settings">Save settings</button>' +
        '</form></section>' +
        '<section class="card pad"><h2>Discount codes</h2><table class="table compact"><tbody>' +
          st.discounts.map((d) => '<tr><td><code>' + esc(d.code) + '</code></td><td>' + esc(d.label) + '</td></tr>').join('') +
        '</tbody></table></section>' +
        '<section class="card pad" data-testid="data-card"><h2>Data</h2>' +
          '<p class="muted">Data is stored in this browser. A new browser session starts from the default data; reloading keeps your changes.</p>' +
          '<div class="btn-row">' +
            '<button class="btn" data-action="reset-data" data-testid="reset-data">Restore default data</button>' +
            '<button class="btn danger-outline" data-action="clear-data" data-testid="clear-data">Start with empty data</button>' +
            '<button class="btn ghost" data-action="export-data" data-testid="export-data">Export JSON</button>' +
          '</div></section>' +
      '</div>';
  }

  function saveSettings(el, e) {
    e.preventDefault();
    const form = document.getElementById('settings-form');
    const val = (n) => form.querySelector('[name="' + n + '"]').value.trim();
    const service = Number(val('serviceCharge'));
    const errors = {};
    if (val('cafeName').length < 2) errors.cafeName = 'Enter the café name';
    if (val('branch').length < 2) errors.branch = 'Enter the branch';
    if (val('serviceCharge') === '' || !Number.isInteger(service) || service < 0 || service > 25) errors.serviceCharge = 'Use a whole number from 0 to 25';
    if (!showErrors(form, errors)) return;
    Store.update((st) => Object.assign(st.settings, { cafeName: val('cafeName'), branch: val('branch'), serviceCharge: service }));
    toast('Settings saved');
    render();
  }

  async function resetData() {
    const ok = await confirmDialog({ title: 'Restore default data?', message: 'All orders, customers and menu changes will be replaced with the default data.', confirmLabel: 'Restore data', danger: true });
    if (!ok) return;
    Store.reseed();
    ui.cart = emptyCart();
    toast('Default data restored');
    render();
  }

  async function clearData() {
    const ok = await confirmDialog({ title: 'Start with empty data?', message: 'This deletes every menu item, customer and order. Staff accounts and discount codes are kept.', confirmLabel: 'Delete everything', danger: true });
    if (!ok) return;
    Store.clearAll();
    ui.cart = emptyCart();
    toast('All data cleared', 'info');
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(S(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hill-street-cafe-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Data exported', 'info');
  }

  // ---------- events ----------

  const actions = {
    'pick-staff': pickStaff,
    'logout': logout,
    'reset-data': resetData,
    'clear-data': clearData,
    'export-data': exportData,
    'save-settings': saveSettings,
    'pos-category': (el) => { ui.pos.category = el.dataset.value; render(); },
    'add-item': addItem,
    'qty-inc': (el) => changeQty(el, 1),
    'qty-dec': (el) => changeQty(el, -1),
    'remove-line': removeLine,
    'line-note': editNote,
    'clear-cart': clearCart,
    'order-type': setOrderType,
    'apply-discount': applyDiscount,
    'remove-discount': removeDiscount,
    'checkout': checkout,
    'advance': (el) => advanceOrder(el.dataset.id),
    'view-order': (el) => viewOrder(el.dataset.id),
    'add-customer': () => customerForm(null),
    'edit-customer': (el) => customerForm(findCustomer(el.dataset.id)),
    'delete-customer': (el) => deleteCustomer(el.dataset.id),
    'add-menu-item': () => menuForm(null),
    'edit-menu-item': (el) => menuForm(findMenu(el.dataset.id)),
    'delete-menu-item': (el) => deleteMenuItem(el.dataset.id),
    'toggle-available': toggleAvailable,
  };

  const binds = {
    'pos-q': (v) => { ui.pos.q = v; refreshMenuGrid(); },
    'cart-table': (v) => { ui.cart.table = v; },
    'cart-customer': (v) => { ui.cart.customerId = v; refreshCart(); },
    'cart-guest': (v) => { ui.cart.guestName = v; },
    'cart-discount': (v) => { ui.cart.discountInput = v; },
    'orders-q': (v) => { ui.orders.q = v; refreshOrders(); },
    'orders-status': (v) => { ui.orders.status = v; refreshOrders(); },
    'orders-range': (v) => { ui.orders.range = v; refreshOrders(); },
    'customers-q': (v) => { ui.customers.q = v; refreshCustomers(); },
    'menu-category': (v) => { ui.menu.category = v; render(); },
    'reports-range': (v) => { ui.reports.range = v; render(); },
  };

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || !actions[el.dataset.action]) return;
    actions[el.dataset.action](el, e);
  });
  app.addEventListener('input', (e) => {
    const el = e.target.closest('[data-bind]');
    if (el && binds[el.dataset.bind]) binds[el.dataset.bind](el.value);
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-bind="cart-discount"]')) { e.preventDefault(); applyDiscount(); }
  });
  app.addEventListener('submit', (e) => e.preventDefault());
  window.addEventListener('hashchange', render);

  // Second tab opened with ?keep=1 stays in sync with the first.
  window.addEventListener('storage', (e) => {
    if (e.key !== Store.DATA_KEY || !e.newValue) return;
    Store.reload();
    if (!modalOpen()) render();
  });

  // Keep kitchen timers fresh without disturbing anyone mid-dialog.
  setInterval(() => {
    if (currentUser() && routeKey() === 'kitchen' && !modalOpen()) render();
  }, 30000);

  Store.init();
  render();
})();
