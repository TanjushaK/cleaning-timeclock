export const CHECKOUT_STANDARD_ACCURACY_M = 80
export const CHECKOUT_MAX_ACCURACY_M = 200
export const CHECKOUT_MAX_UNCERTAINTY_ALLOWANCE_M = 100

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadiusM = 6371000
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusM * c
}

/**
 * Checkout remains geofenced, but a normal GPS uncertainty circle may overlap the site radius.
 * The uncertainty allowance is capped so a very poor fix can never authorize checkout from far away.
 */
export function evaluateCheckoutGeofence({ lat, lng, accuracy, siteLat, siteLng, radius }) {
  const distanceM = haversineMeters(lat, lng, siteLat, siteLng)
  const accuracyM = Math.max(0, accuracy)
  const radiusM = Math.max(0, radius)
  const uncertaintyAllowanceM = Math.min(accuracyM, CHECKOUT_MAX_UNCERTAINTY_ALLOWANCE_M)

  if (accuracyM > CHECKOUT_MAX_ACCURACY_M) {
    return {
      allowed: false,
      reason: 'accuracy_too_low',
      reviewRequired: true,
      distanceM,
      accuracyM,
      radiusM,
      uncertaintyAllowanceM,
    }
  }

  if (distanceM <= radiusM) {
    return {
      allowed: true,
      reason: 'inside',
      reviewRequired: accuracyM > CHECKOUT_STANDARD_ACCURACY_M,
      distanceM,
      accuracyM,
      radiusM,
      uncertaintyAllowanceM,
    }
  }

  if (distanceM - uncertaintyAllowanceM <= radiusM) {
    return {
      allowed: true,
      reason: 'uncertainty_overlap',
      reviewRequired: true,
      distanceM,
      accuracyM,
      radiusM,
      uncertaintyAllowanceM,
    }
  }

  return {
    allowed: false,
    reason: 'outside',
    reviewRequired: true,
    distanceM,
    accuracyM,
    radiusM,
    uncertaintyAllowanceM,
  }
}
