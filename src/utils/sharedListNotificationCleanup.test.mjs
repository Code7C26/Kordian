import assert from 'node:assert/strict'
import test from 'node:test'
import { clearSharedListNotifications } from './sharedListNotificationCleanup.js'

test('clears only shared-list pending and delivered notifications', async () => {
  const calls = []
  const localNotifications = {
    getPending: async () => ({
      notifications: [
        { id: 1, extra: { type: 'shared_list_item_added' } },
        { id: 2, extra: { type: 'other' } },
      ],
    }),
    cancel: async (value) => calls.push(['cancel', value.notifications.map(({ id }) => id)]),
    getDeliveredNotifications: async () => ({
      notifications: [
        { id: 3, extra: { type: 'shared_list_invitation' } },
        { id: 4, extra: { type: 'other' } },
      ],
    }),
    removeDeliveredNotifications: async (value) => calls.push(['remove-local', value.notifications.map(({ id }) => id)]),
  }
  const pushNotifications = {
    getDeliveredNotifications: async () => ({
      notifications: [
        { id: 'push-1', data: { type: 'shared_list_item_added' } },
        { id: 'push-2', data: { type: 'other' } },
      ],
    }),
    removeDeliveredNotifications: async (value) => calls.push(['remove-push', value.notifications.map(({ id }) => id)]),
  }

  await clearSharedListNotifications(localNotifications, pushNotifications)

  assert.deepEqual(calls, [
    ['cancel', [1]],
    ['remove-local', [3]],
    ['remove-push', ['push-1']],
  ])
})

test('does not call removal APIs when there are no shared-list notifications', async () => {
  const localNotifications = {
    getPending: async () => ({ notifications: [] }),
    cancel: () => assert.fail('Unexpected pending-notification cancellation'),
    getDeliveredNotifications: async () => ({ notifications: [] }),
    removeDeliveredNotifications: () => assert.fail('Unexpected local-notification removal'),
  }
  const pushNotifications = {
    getDeliveredNotifications: async () => ({ notifications: [] }),
    removeDeliveredNotifications: () => assert.fail('Unexpected push-notification removal'),
  }

  await clearSharedListNotifications(localNotifications, pushNotifications)
})
