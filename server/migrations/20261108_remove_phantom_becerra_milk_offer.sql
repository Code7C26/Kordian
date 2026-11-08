BEGIN;

DELETE FROM public.offers AS offer
USING public.products AS product
WHERE offer.product_id = product.id
  AND product.ean = '7790742348203'
  AND product.source = 'disco'
  AND product.source_product_id = '331926'
  AND lower(btrim(offer.supermarket)) = 'becerra';

COMMIT;
