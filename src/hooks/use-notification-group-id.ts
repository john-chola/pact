import * as Notifications from 'expo-notifications';

/** Group id carried by the notification the user last tapped (e.g. a nudge). */
export function useNotificationGroupId(): string | undefined {
  const response = Notifications.useLastNotificationResponse();
  const groupId = response?.notification.request.content.data?.groupId;
  return typeof groupId === 'string' ? groupId : undefined;
}
