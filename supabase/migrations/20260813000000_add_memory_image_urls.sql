ALTER TABLE public.memories
ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.memories
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(image_urls) = 0;
