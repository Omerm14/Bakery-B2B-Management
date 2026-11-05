// What Claude can do when answering a question in the bot: the read-only
// report functions from migration 067, plus sending the designed summary
// image. Plain data (no SDK types) so it can be checked under Node.

const range = {
  from: { type: 'string', description: 'First delivery date, YYYY-MM-DD (inclusive).' },
  to: { type: 'string', description: 'Last delivery date, YYYY-MM-DD (inclusive). Same as from for a single day.' },
}
const customerId = { type: 'string', description: 'Customer id from find_customers.' }

const tool = (name, description, properties, required) => ({
  name, description,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
  strict: true,
})

export const TOOLS = [
  tool('find_customers',
    'Search customers by (part of) their name, Hebrew or English. Returns id, name, active flag and last order date. Call it before any customer report — names in the question are rarely exact. An empty query lists all active customers.',
    { query: { type: 'string', description: 'Name or part of it, e.g. "ביאליק". Empty string for all active customers.' } }, ['query']),
  tool('find_items',
    'Search products (menu items) by name or category. Returns id, name, category, unit.',
    { query: { type: 'string', description: 'Product name or part of it, or a category name.' } }, ['query']),
  tool('customer_report',
    "One customer's orders for a date range: total units, delivery days, every product with quantity (and the previous period of the same length for comparison), categories, units per day (with per-day product detail for ranges up to 31 days), and value where prices are set.",
    { customer_id: customerId, ...range }, ['customer_id', 'from', 'to']),
  tool('item_report',
    'One product for a date range: total quantity, quantity per customer, per day, and the previous period of the same length.',
    { item_id: { type: 'string', description: 'Product id from find_items.' }, ...range }, ['item_id', 'from', 'to']),
  tool('overview',
    'All customers for a date range: total units, units per day, every customer with units (and the previous period), customers who ordered in the previous period but not in this one, top products and categories.',
    range, ['from', 'to']),
  tool('customer_changes',
    "Changes to a customer's order from the change log: who changed which product, from what quantity to what, and when. by='changed' finds changes made on those dates; by='delivery' finds changes to deliveries on those dates.",
    { customer_id: customerId, ...range, by: { type: 'string', enum: ['changed', 'delivery'] } }, ['customer_id', 'from', 'to', 'by']),
  tool('send_customer_summary_card',
    "Draw a designed summary image of one customer's orders for a date range (KPIs, units over time, products with change vs. the previous period, category split) and send it to the chat. Use it whenever a summary (סיכום) of a customer is asked for. Returns the same data as customer_report.",
    { customer_id: customerId, ...range }, ['customer_id', 'from', 'to']),
]

// Tool name → database function and its argument names.
export const RPC = {
  find_customers: { fn: 'bot_find_customers', args: i => ({ p_query: i.query ?? '' }) },
  find_items: { fn: 'bot_find_items', args: i => ({ p_query: i.query ?? '' }) },
  customer_report: { fn: 'bot_customer_report', args: i => ({ p_customer_id: i.customer_id, p_from: i.from, p_to: i.to }) },
  item_report: { fn: 'bot_item_report', args: i => ({ p_item_id: i.item_id, p_from: i.from, p_to: i.to }) },
  overview: { fn: 'bot_overview', args: i => ({ p_from: i.from, p_to: i.to }) },
  customer_changes: { fn: 'bot_customer_changes', args: i => ({ p_customer_id: i.customer_id, p_from: i.from, p_to: i.to, p_by: i.by ?? 'changed' }) },
  send_customer_summary_card: { fn: 'bot_customer_report', args: i => ({ p_customer_id: i.customer_id, p_from: i.from, p_to: i.to }) },
}

export const SYSTEM_PROMPT = `You are the data assistant of a wholesale bakery, answering the owner's team in Telegram. They ask in Hebrew about customers' orders: how much a customer ordered on a day or in a week, which products, how a customer compares with last week, who stopped ordering, what changed in an order, and so on.

How the data works:
- Every order line is a customer × product × delivery date with a quantity. Quantity 0 means "not ordered". Dates are delivery dates.
- Weeks run Sunday to Saturday. "Last week", "this week", "yesterday" etc. resolve against the dates given below.
- The next week's orders already exist before delivery (they are copied forward every Wednesday and customers edit them), so dates in the future are planned orders — say so when you report them.
- Reports include the previous period of the same length; use it when a comparison helps, without being asked twice.
- You can only read. If asked to change an order, say that changes are made in the app.

How to answer:
- Get every number from the tools. Never estimate or invent a number, name or date. If the data is empty, say so plainly.
- Customer names in questions are often partial or misspelled: call find_customers first. If several customers match and the question doesn't make clear which, list them briefly and ask. If none match, try a shorter part of the name before giving up.
- If the period is missing, use the most natural one (a day → that day; otherwise the current week so far, or the last full week when the current one has barely started) and say which dates you used.
- When asked for a summary (סיכום) of a customer, call send_customer_summary_card — it sends a designed image to the chat. Then reply with a short text: 2–4 lines on what stands out (big changes, new or dropped products). Don't repeat everything that is in the image.
- For other questions answer directly and briefly: lead with the number that was asked for, then only the detail that helps.
- Write in Hebrew. Format for Telegram HTML: only <b>, <i>, <u>, <code>, <blockquote> tags — no Markdown, no tables, no other tags. Use short lines and simple lists ("• "). Numbers with thousands separators; dates as DD/MM (with weekday when it helps, e.g. "שלישי 28/10"). Keep units (יח׳, ק״ג, מגש) as given. At most one or two emoji, if any.`

export const HELP_TEXT = `👋 אפשר לשאול אותי על ההזמנות, למשל:
• כמה הזמין קפה ביאליק ביום שלישי?
• כמה לחם שאור הזמינו השבוע, ומי?
• סיכום על קיוסקו לחודש האחרון
• מי הפסיק להזמין השבוע לעומת שבוע שעבר?
• מה קפה ביאליק שינה בהזמנה היום?

אני רק קורא נתונים — שינויים בהזמנות נעשים באפליקציה.`
