import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHECKOUT_MAX_ACCURACY_M,
  evaluateCheckoutGeofence,
} from '../lib/checkout-geofence.mjs'

const site = { siteLat: 52, siteLng: 4, radius: 100 }

function pointNorth(distanceM) {
  return {
    lat: site.siteLat + distanceM / 111_320,
    lng: site.siteLng,
  }
}

test('allows checkout clearly inside the site without review', () => {
  const result = evaluateCheckoutGeofence({ ...pointNorth(40), accuracy: 20, ...site })
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'inside')
  assert.equal(result.reviewRequired, false)
})

test('allows an inside checkout with weak but bounded GPS and marks it for review', () => {
  const result = evaluateCheckoutGeofence({ ...pointNorth(40), accuracy: 120, ...site })
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'inside')
  assert.equal(result.reviewRequired, true)
})

test('allows a borderline checkout when the GPS uncertainty overlaps the site radius', () => {
  const result = evaluateCheckoutGeofence({ ...pointNorth(110), accuracy: 30, ...site })
  assert.equal(result.allowed, true)
  assert.equal(result.reason, 'uncertainty_overlap')
  assert.equal(result.reviewRequired, true)
})

test('blocks checkout well outside the site', () => {
  const result = evaluateCheckoutGeofence({ ...pointNorth(500), accuracy: 30, ...site })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'outside')
})

test('caps uncertainty so a poor fix cannot authorize checkout from far away', () => {
  const result = evaluateCheckoutGeofence({ ...pointNorth(250), accuracy: 200, ...site })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'outside')
  assert.equal(result.uncertaintyAllowanceM, 100)
})

test('rejects unusably inaccurate GPS even when the reported point is inside', () => {
  const result = evaluateCheckoutGeofence({
    ...pointNorth(40),
    accuracy: CHECKOUT_MAX_ACCURACY_M + 1,
    ...site,
  })
  assert.equal(result.allowed, false)
  assert.equal(result.reason, 'accuracy_too_low')
})
