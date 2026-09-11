/**
 * Constructs a direct Google Maps URL using coordinates or fallback address.
 */
export const getGoogleMapsUrl = (location) => {
  const coords = location?.coordinates;
  const lat = coords?.lat ?? coords?.latitude;
  const lng = coords?.lng ?? coords?.longitude;

  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const queryAddress = [
    location?.address,
    location?.city,
    location?.district,
    location?.state,
  ]
    .filter(Boolean)
    .join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    queryAddress || "Hogenakkal, Tamil Nadu"
  )}`;
};

/**
 * Builds an OpenStreetMap embed iframe URL based on owner's pin.
 */
export const getEmbedMapUrl = (location) => {
  const coords = location?.coordinates;
  const lat = Number(coords?.lat ?? coords?.latitude) || 12.1226;
  const lng = Number(coords?.lng ?? coords?.longitude) || 77.7770;

  const delta = 0.008;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
};