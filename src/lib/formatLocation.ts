// Location names come from the place search as a full address ("4067 Prowse Lane SW,
// Vancouver, BC, Canada"). Cards only have room for — and only need — the city/region
// and country, so collapse everything else out.
export const shortLocation = (location: string) => {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(", ");
  const city = parts.length >= 4 ? parts[1] : parts[0];
  return [city, parts[parts.length - 1]].join(", ");
};
