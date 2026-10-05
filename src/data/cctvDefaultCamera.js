// Default CCTV camera selection for a layer that has no real (user/voice) selection yet.

/** City whose camera the layer lands on when first enabled with nothing selected. */
export const DEFAULT_CCTV_CITY_ID = 'denpasar';

/**
 * Picks the camera the layer should land on when nothing was selected:
 * a live (configured) camera in the default city, then any camera in the
 * default city (seed), then the first catalog record.
 * @param {Object[]} records - Camera runtime records (`record.camera`).
 * @param {string} [cityId=DEFAULT_CCTV_CITY_ID] - Preferred city.
 * @returns {string|null} Camera ID, or null for an empty catalog.
 */
export function pickDefaultCameraId(records, cityId = DEFAULT_CCTV_CITY_ID) {
  const cameras = (Array.isArray(records) ? records : [])
    .map((record) => record?.camera)
    .filter((camera) => camera?.id);
  if (!cameras.length) return null;
  const inCity = cameras.filter((camera) => camera.cityId === cityId);
  const live = inCity.find((camera) => camera.feedConfigured === true);
  return (live || inCity[0] || cameras[0]).id;
}
