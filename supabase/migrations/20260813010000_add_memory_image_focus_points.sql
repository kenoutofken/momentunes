ALTER TABLE public.memories
ADD COLUMN IF NOT EXISTS image_focus_points JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.memories
SET image_focus_points = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('x', 50, 'y', 50)), '[]'::jsonb)
  FROM unnest(image_urls) AS image_url
)
WHERE jsonb_array_length(image_focus_points) = 0
  AND cardinality(image_urls) > 0;
