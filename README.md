# Hill Street Café POS

Point-of-sale app for Hill Street Café, Kandy. It handles the register, the kitchen board, orders, loyalty customers, menu management and sales reports.

Plain HTML/CSS/JS. There's no build step, no server and no dependencies. Data is stored in the browser.

## Getting started

Run the built-in local server (Node 14+, no `npm install` needed):

```bash
cd cafe-pos
npm start                   # http://localhost:6767
node server.js 8080         # pick another port
```

`PORT=8080` also sets the port. Set `HOST=0.0.0.0` to open it from other devices on the same network at `http://<this-pc-ip>:6767`. Each device keeps its own data, because data is stored in the browser.

You can still open `index.html` directly, or serve the folder with `python -m http.server 6767 -d cafe-pos`.

## Staff accounts

| Name | Role | PIN |
|---|---|---|
| Nimali Fernando | Cashier | 1111 |
| Tharindu Bandara | Cashier | 3333 |
| Kasun Jayasinghe | Barista | 2222 |
| Dilini Wickramasinghe | Manager | 9999 |

| Role | Access |
|---|---|
| Cashier | Register, Kitchen (serve ready orders), Orders, Customers |
| Barista | Kitchen (start / mark ready), Orders (view) |
| Manager | Everything, including Menu, Reports and Settings |

Opening a page your role can't access sends you to your home page.

## Features

- **Register:**
  - Search the menu or filter by category, then add items, set quantities and add kitchen notes.
  - Takeaway or dine-in with a table; attach a loyalty customer or a name.
  - Discount codes, card or cash payment with change calculation, and a printed-style receipt.
- **Kitchen board:** orders move New → Preparing → Ready → Completed. Tickets waiting 15 minutes or more are flagged.
- **Orders:** search, filter by status and date, view details and timeline, cancel with a reason, delete (manager only).
- **Customers:** loyalty members with points. Add, edit and delete.
- **Menu:** add, edit and delete items, track stock, and toggle availability.
- **Reports:** sales, order count, average order, cancellations, top items, payment methods, daily sales and sales by cashier.
- **Settings:** café details, service charge, discount codes, data restore, clear and JSON export.

All messages appear in the page as toasts and dialogs; there are no browser pop-ups or notifications.

## Business rules

- **Service charge:** 10% on dine-in orders, applied after discount. Configurable from 0 to 25%.
- **Discount codes:**
  - `STUDENT10`: 10% off.
  - `LOYAL20`: 20% off. Needs a loyalty customer with 100 or more points and uses 100 points.
  - `WELCOME500`: LKR 500 off orders of LKR 2,500 or more.
- **Loyalty:** customers earn 1 point per LKR 100. Cancelling an order reverses earned points and refunds redeemed points.
- **Stock:** items with tracked stock can't be sold beyond what's left. Checkout deducts stock and cancelling restores it. Items without a stock count are made to order.
- **Order steps:** the barista moves orders to Preparing and Ready. A cashier marks Ready orders as served. A manager can do any step.
- **Cancelling:** only New or Preparing orders can be cancelled, by a cashier or manager, and a reason is required.
- **Validation:**
  - Dine-in orders need a table.
  - Cash received must cover the total.
  - Customer mobile numbers must be `07XXXXXXXX` and unique.
  - Menu item names must be unique, and prices must be whole numbers above 0.

## Data

All data is kept in the browser's `localStorage`.

| Situation | Result |
|---|---|
| New browser session or tab | Starts from the default data, and staff must sign in |
| Reload in the same tab | Changes and sign-in are kept |
| `?reset=1` in the URL | Restores the default data |
| `?keep=1` in the URL | Opens another tab on the current data; the two tabs stay in sync |
| Settings → Restore default data | Restores the default data |
| Settings → Start with empty data | Removes the menu, customers and orders; keeps staff and discount codes |

The default data includes the menu, five loyalty customers and the past week of orders. Timestamps are relative to the current time.

## Routes

`#/pos` `#/kitchen` `#/orders` `#/customers` `#/menu` `#/reports` `#/settings`

## Project structure

```
index.html     page shell
styles.css     styles (responsive down to phone width)
js/store.js    persistence, session rules, pricing
js/seed.js     default data
js/ui.js       toasts, dialogs, formatting
js/app.js      routing, views and actions
```

Interactive elements carry `data-testid` attributes, e.g. `login-nimali`, `menu-item-fish-bun`, `checkout`, `ticket-1046`, `order-row-1046`, `confirm-ok`.
