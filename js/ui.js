/*
 * UI helpers: formatting, in-app toasts and modal dialogs.
 * All feedback stays in the page: no alert()/confirm()/prompt() or browser notifications.
 */
(function () {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const money = (n) => 'LKR ' + Number(n || 0).toLocaleString('en-US');
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  function timeAgo(iso) {
    const m = minutesSince(iso);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    return dateLabel(iso);
  }
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function toast(message, type) {
    type = type || 'success';
    const root = document.getElementById('toasts');
    while (root.children.length >= 3) root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.setAttribute('data-testid', 'toast-' + type);
    el.innerHTML = '<span>' + esc(message) + '</span><button class="toast-close" aria-label="Dismiss">×</button>';
    el.querySelector('button').addEventListener('click', () => el.remove());
    root.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
  }

  /**
   * openModal({ title, body, actions, testid, size, onMount }) -> Promise<value|null>
   * actions: [{ label, value, kind, testid, onClick(modalEl) }]
   *   onClick may return false to keep the modal open (e.g. validation failed),
   *   or any other value to resolve with it.
   */
  function openModal(opts) {
    return new Promise((resolve) => {
      const actions = opts.actions || [{ label: 'Close', value: null }];
      const root = document.getElementById('modal-root');
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid="' + esc(opts.testid || 'modal') + '">' +
          '<header class="modal-head"><h2 id="modal-title">' + esc(opts.title) + '</h2>' +
          '<button class="icon-btn" data-close aria-label="Close dialog" data-testid="modal-close">×</button></header>' +
          '<div class="modal-body">' + opts.body + '</div>' +
          '<footer class="modal-foot">' + actions.map((a, i) =>
            '<button type="button" class="btn ' + (a.kind || '') + '" data-idx="' + i + '"' +
            (a.testid ? ' data-testid="' + esc(a.testid) + '"' : '') + '>' + esc(a.label) + '</button>').join('') +
          '</footer></div>';
      root.appendChild(backdrop);
      const modal = backdrop.querySelector('.modal');
      const previousFocus = document.activeElement;

      function close(value) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        resolve(value === undefined ? null : value);
      }
      function run(action) {
        if (!action.onClick) return close(action.value);
        const result = action.onClick(modal);
        if (result !== false) close(result === undefined ? action.value : result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
      }

      document.addEventListener('keydown', onKey);
      backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(null); });
      modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) return close(null);
        const btn = e.target.closest('[data-idx]');
        if (btn) run(actions[Number(btn.dataset.idx)]);
      });
      // Enter inside a form triggers the primary action.
      modal.addEventListener('submit', (e) => {
        e.preventDefault();
        const primary = actions.find((a) => a.kind === 'primary' || a.kind === 'danger');
        if (primary) run(primary);
      });

      if (opts.onMount) opts.onMount(modal, close);
      const focusTarget = modal.querySelector('[autofocus], input, select, textarea') || modal.querySelector('.modal-foot .primary, .modal-foot .btn');
      if (focusTarget) focusTarget.focus();
    });
  }

  function confirmDialog(opts) {
    return openModal({
      title: opts.title,
      testid: opts.testid || 'confirm-dialog',
      body: '<p>' + esc(opts.message) + '</p>',
      actions: [
        { label: 'Cancel', value: false, testid: 'confirm-cancel' },
        { label: opts.confirmLabel || 'Confirm', value: true, kind: opts.danger ? 'danger' : 'primary', testid: 'confirm-ok' },
      ],
    }).then((v) => v === true);
  }

  /** Show inline field errors inside a form. errors: { fieldName: message } */
  function showErrors(scope, errors) {
    scope.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    scope.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    let first = null;
    Object.keys(errors).forEach((name) => {
      const input = scope.querySelector('[name="' + name + '"]');
      const slot = scope.querySelector('[data-error-for="' + name + '"]');
      if (slot) slot.textContent = errors[name];
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        if (!first) first = input;
      }
    });
    if (first) first.focus();
    return Object.keys(errors).length === 0;
  }

  window.UI = { esc, money, clock, dateLabel, timeAgo, minutesSince, isSameDay, slug, toast, openModal, confirmDialog, showErrors };
})();
