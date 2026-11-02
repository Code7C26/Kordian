const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require('firebase-admin/app')
const { getMessaging } = require('firebase-admin/messaging')

let missingCredentialsWarningShown = false

function buildSharedListItemAddedPushMessage({ actorUsername, itemName, listId, listName }) {
  return {
    notification: {
      title: 'Lista compartida',
      body: `${actorUsername} agregó ${itemName} a la lista compartida.`,
    },
    data: {
      type: 'shared_list_item_added',
      listId: String(listId),
      listName: String(listName),
    },
    android: {
      priority: 'high',
      notification: { channelId: 'shared-list-activity' },
    },
  }
}

function getConfiguredMessaging() {
  let app = getApps()[0]
  if (!app) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (serviceAccountJson) {
      app = initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = initializeApp({ credential: applicationDefault() })
    } else {
      if (!missingCredentialsWarningShown) {
        console.warn('Firebase push notifications are disabled: configure server Firebase credentials.')
        missingCredentialsWarningShown = true
      }
      return null
    }
  }
  return getMessaging(app)
}

async function sendSharedListItemAddedPushNotifications({
  adminClient,
  actorUserId,
  itemName,
  listId,
  listName,
  recipientUserIds,
}) {
  if (!recipientUserIds.length) return

  const messaging = getConfiguredMessaging()
  if (!messaging) return

  const [{ data: profile, error: profileError }, { data: devices, error: devicesError }] = await Promise.all([
    adminClient
      .from('customer_profiles')
      .select('username')
      .eq('user_id', actorUserId)
      .maybeSingle(),
    adminClient
      .from('customer_push_tokens')
      .select('token')
      .in('user_id', recipientUserIds),
  ])
  if (profileError) throw profileError
  if (devicesError) throw devicesError

  const tokens = [...new Set((devices || []).map((device) => device.token).filter(Boolean))]
  if (!tokens.length) return

  const message = buildSharedListItemAddedPushMessage({
    actorUsername: profile?.username || 'Alguien',
    itemName,
    listId,
    listName,
  })

  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500)
    const result = await messaging.sendEachForMulticast({ ...message, tokens: batch })
    const invalidTokens = result.responses.flatMap((response, tokenIndex) => {
      const errorCode = response.error?.code
      return errorCode === 'messaging/invalid-registration-token'
        || errorCode === 'messaging/registration-token-not-registered'
        ? [batch[tokenIndex]]
        : []
    })

    if (invalidTokens.length) {
      const { error } = await adminClient
        .from('customer_push_tokens')
        .delete()
        .in('token', invalidTokens)
      if (error) throw error
    }

    if (result.failureCount) {
      console.error('Some shared-list push notifications failed to send', {
        listId,
        failureCount: result.failureCount,
      })
    }
  }
}

module.exports = {
  buildSharedListItemAddedPushMessage,
  sendSharedListItemAddedPushNotifications,
}
