-- Lets staff ("the floor") know when a customer has sent a self-service
-- order update, since the customer portal no longer auto-saves silently —
-- every send is now a deliberate customer action worth surfacing. One row
-- per "שלח הזמנה" click, not per line item (a single notification for
-- "customer X updated their order for week Y").
CREATE TABLE IF NOT EXISTS order_change_notifications (
  id         uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  week_id    uuid not null references weeks(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at    timestamptz,
  seen_by    text
);

CREATE INDEX IF NOT EXISTS order_change_notifications_unseen_idx
  ON order_change_notifications (created_at) WHERE seen_at IS NULL;

ALTER TABLE order_change_notifications ENABLE ROW LEVEL SECURITY;

-- Staff manage everything (read the feed, mark as seen).
CREATE POLICY "staff_all" ON order_change_notifications FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- A customer may only insert a notification for their own send action —
-- never read the feed (that's staff's inbox, not theirs) or anyone else's.
CREATE POLICY "customer_insert_own" ON order_change_notifications FOR INSERT TO authenticated
  WITH CHECK (customer_id = current_customer_id());
