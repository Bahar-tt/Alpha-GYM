/*
# Create orders table for Netrino online order form

1. New Tables
- `orders`
  - `id` (uuid, primary key)
  - `name` (text, customer full name)
  - `phone` (text, contact phone)
  - `email` (text, contact email, nullable)
  - `service_type` (text, selected service category)
  - `service_name` (text, specific service requested)
  - `description` (text, order details/description)
  - `file_url` (text, URL of uploaded file in storage, nullable)
  - `file_name` (text, original uploaded file name, nullable)
  - `status` (text, order status: pending/accepted/completed, default pending)
  - `created_at` (timestamptz, default now)

2. Storage
- Create `order-files` bucket for customer file uploads (public read for retrieval)

3. Security
- Enable RLS on `orders`.
- Allow anon + authenticated INSERT (customers submit orders without login).
- Allow anon + authenticated SELECT (so order status can be checked).
- Storage bucket policies: allow public upload and read.
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  service_type text NOT NULL,
  service_name text NOT NULL,
  description text,
  file_url text,
  file_name text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

-- Create storage bucket for order file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-files', 'order-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for order-files bucket
DROP POLICY IF EXISTS "Allow public upload to order-files" ON storage.objects;
CREATE POLICY "Allow public upload to order-files" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'order-files');

DROP POLICY IF EXISTS "Allow public read from order-files" ON storage.objects;
CREATE POLICY "Allow public read from order-files" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'order-files');
