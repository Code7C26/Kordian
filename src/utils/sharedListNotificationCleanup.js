const SHARED_LIST_NOTIFICATION_TYPES = new Set([
  'shared_list_item_added',
  'shared_list_invitation',
])

function isSharedListNotification(notification) {
  const type = notification?.data?.type || notification?.extra?.type
  return SHARED_LIST_NOTIFICATION_TYPES.has(type)
}

export async function clearSharedListNotifications(localNotifications, pushNotifications) {
  const pending = await localNotifications.getPending()
  const pendingSharedListNotifications = (pending.notifications || [])
    .filter(isSharedListNotification)
    .map(({ id }) => ({ id }))
  if (pendingSharedListNotifications.length) {
    await localNotifications.cancel({ notifications: pendingSharedListNotifications })
  }

  const localDelivered = await localNotifications.getDeliveredNotifications()
  const localSharedListNotifications = (localDelivered.notifications || []).filter(isSharedListNotification)
  if (localSharedListNotifications.length) {
    await localNotifications.removeDeliveredNotifications({ notifications: localSharedListNotifications })
  }

  const pushDelivered = await pushNotifications.getDeliveredNotifications()
  const pushSharedListNotifications = (pushDelivered.notifications || []).filter(isSharedListNotification)
  if (pushSharedListNotifications.length) {
    await pushNotifications.removeDeliveredNotifications({ notifications: pushSharedListNotifications })
  }
}
