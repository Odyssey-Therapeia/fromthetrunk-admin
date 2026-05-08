-- Keep current checkout writes compatible with production databases that still
-- carry legacy rupee/address columns alongside the newer paise columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'subtotal'
  ) THEN
    EXECUTE $function$
      CREATE OR REPLACE FUNCTION sync_orders_legacy_checkout_columns()
      RETURNS trigger AS $body$
      BEGIN
        NEW.subtotal = COALESCE(NEW.subtotal, NEW.subtotal_paise::numeric / 100);
        NEW.shipping_cost = COALESCE(NEW.shipping_cost, NEW.shipping_cost_paise::numeric / 100);
        NEW.tax_amount = COALESCE(NEW.tax_amount, NEW.tax_amount_paise::numeric / 100);
        NEW.total = COALESCE(NEW.total, NEW.total_paise::numeric / 100);

        NEW.shipping_address_name = COALESCE(NEW.shipping_address_name, NEW.shipping_name);
        NEW.shipping_address_line1 = COALESCE(NEW.shipping_address_line1, NEW.shipping_line1);
        NEW.shipping_address_line2 = COALESCE(NEW.shipping_address_line2, NEW.shipping_line2);
        NEW.shipping_address_city = COALESCE(NEW.shipping_address_city, NEW.shipping_city);
        NEW.shipping_address_state = COALESCE(NEW.shipping_address_state, NEW.shipping_state);
        NEW.shipping_address_postal_code = COALESCE(
          NEW.shipping_address_postal_code,
          NEW.shipping_postal_code
        );
        NEW.shipping_address_country = COALESCE(NEW.shipping_address_country, NEW.shipping_country);
        NEW.shipping_address_phone = COALESCE(NEW.shipping_address_phone, NEW.shipping_phone);
        NEW.shipping_address_email = COALESCE(NEW.shipping_address_email, NEW.shipping_email);

        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
    $function$;

    DROP TRIGGER IF EXISTS orders_sync_legacy_checkout_columns ON orders;
    CREATE TRIGGER orders_sync_legacy_checkout_columns
      BEFORE INSERT OR UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION sync_orders_legacy_checkout_columns();
  END IF;
END $$;
