const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSharedListItemAddedPushMessage } = require('./sharedListPushNotifications')

test('push message names the person and product and identifies the list', () => {
  assert.deepEqual(buildSharedListItemAddedPushMessage({
    actorUsername: 'matias',
    itemName: 'Leche',
    listId: 'list-123',
    listName: 'Compras',
  }), {
    notification: {
      title: 'Lista compartida',
      body: 'matias agregó Leche a la lista compartida.',
    },
    data: {
      type: 'shared_list_item_added',
      listId: 'list-123',
      listName: 'Compras',
    },
    android: {
      priority: 'high',
      notification: { channelId: 'shared-list-activity' },
    },
  })
})
