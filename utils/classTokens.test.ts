import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertIdempotencyKey,
  attendanceConsumesToken,
  tokenBalanceStatus,
  tokenKindForEvent,
  tokenKindForPackage,
} from './classTokens.ts'

test('group tokens stay off individual and pro classes', () => {
  assert.equal(tokenKindForPackage('principiante', 'group_pack_5'), 'group')
  assert.equal(tokenKindForPackage('principiante', 'individual_session'), 'individual')
  assert.equal(tokenKindForPackage('pro_street', 'group_pack_5'), 'pro')
  assert.equal(tokenKindForPackage('pro_bowl', 'individual_pack_3'), 'pro')
  assert.equal(tokenKindForEvent('class_session', 'principiante'), 'group')
  assert.equal(tokenKindForEvent('class_individual', 'principiante'), 'individual')
  assert.equal(tokenKindForEvent('class_session', 'pro_street'), 'pro')
  assert.notEqual(tokenKindForEvent('class_individual', null), 'group')
})

test('balance status treats zero as empty, not inactive', () => {
  assert.equal(tokenBalanceStatus(8, true), 'healthy')
  assert.equal(tokenBalanceStatus(2, true), 'low')
  assert.equal(tokenBalanceStatus(1, true), 'low')
  assert.equal(tokenBalanceStatus(0, true), 'zero')
  assert.equal(tokenBalanceStatus(0, false), 'inactive')
  assert.equal(tokenBalanceStatus(6, false), 'inactive')
})

test('present and absent consume a token; excused and cancelled do not', () => {
  assert.equal(attendanceConsumesToken('present'), true)
  assert.equal(attendanceConsumesToken('absent'), true)
  assert.equal(attendanceConsumesToken('excused'), false)
  assert.equal(attendanceConsumesToken('cancelled'), false)
})

test('a purchase without an idempotency key is rejected', () => {
  assert.equal(assertIdempotencyKey('  purchase-1  '), 'purchase-1')
  assert.throws(() => assertIdempotencyKey('   '), /idempotency key is required/)
})
