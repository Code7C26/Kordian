const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildSharedListInvitationPushMessage,
  buildSharedListItemAddedPushMessage,
} = require('./sharedListPushNotifications')

test('push message names the person and product and identifies the list', () => {
  assert.deepEqual(buildSharedListItemAddedPushMessage({
    actorUsername: 'matias',
    itemName: 'Leche',
    listId: 'list-123',
    listName: 'Compras',
  }), {
    notification: {
      title: 'Lista compartida',
      body: 'matias agregó Leche a la lista "Compras".',
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

  test('invitation push message identifies the inviter and the shared list', () => {
    assert.deepEqual(buildSharedListInvitationPushMessage({
      actorUsername: 'matias',
      invitationId: 'invitation-123',
      listId: 'list-123',
      listName: 'Compras',
    }), {
      notification: {
        title: 'Invitación a lista compartida',
        body: 'matias te invitó a unirte a la lista "Compras".',
      },
      data: {
        type: 'shared_list_invitation',
        invitationId: 'invitation-123',
        listId: 'list-123',
        listName: 'Compras',
      },
      android: {
        priority: 'high',
        notification: { channelId: 'shared-list-activity' },
      },
    })
  })
})
