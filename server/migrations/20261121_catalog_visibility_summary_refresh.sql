BEGIN;

DROP TRIGGER IF EXISTS catalog_offer_price_summary_offer_update ON public.offers;
CREATE TRIGGER catalog_offer_price_summary_offer_update
AFTER UPDATE OF product_id, cash_price, supermarket, is_catalog_visible ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.refresh_catalog_offer_price_summary_trigger();

DELETE FROM public.catalog_offer_price_summary AS summary
USING public.offers AS offer
WHERE summary.offer_id = offer.id
  AND offer.is_catalog_visible IS NOT TRUE;

COMMIT;
