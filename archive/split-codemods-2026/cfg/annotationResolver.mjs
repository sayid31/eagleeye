export default {
  file: 'src/annotations/annotationResolver.js', prefix: 'annotationResolver', layerName: null,
  parentKeeps: 'resolveAnnotationTarget',
  map: {
    annotationResolverCache: 'cacheRead cacheWrite negCache linkAbort',
    annotationResolverScope: 'synthesizeBufferedArea groundsRadiusFromViewport exceedsScopeArea ringAreaM2 isPointLikeTarget isGroundsLikeAsk isMonumentLikeQuery isGroundsLikeQuery',
    annotationResolverGeocode: 'geocodePlace normalizeGeocodeViewport placesTextSearch extractPrimaryName scopeFromTypes adminScopeFromAsk refineScope placesNearViewRecovery',
    annotationResolverOverpass: 'overpassHasError isRateLimitedOutcome parseRetryAfterMs overpassJson fetchAdminArea fetchPlaceArea fetchStreet',
    annotationResolverFootprint: 'fetchFootprint fetchEnclosingArea fetchLocalMonument selectFootprint buildingHeightFromTags parseMeters viewportProximity viewportBias',
    annotationResolverWorld: 'pickWorldFromScreen sampleGroundHeight shortLabel resolveRegionRingForQuery',
  },
  layerMethods: {}, headers: {},
};
