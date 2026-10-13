import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Notifications only work on physical devices');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission denied');
    return false;
  }

  await ensureAndroidChannel();
  return true;
}

/**
 * Saves this device's Expo push token so the `nudge` Edge Function can reach
 * it. Never prompts — call `requestNotificationPermissions` first for that.
 */
export async function syncPushToken() {
  try {
    if (!Device.isDevice || Platform.OS === 'web') return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await ensureAndroidChannel();
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase
      .from('push_tokens')
      .upsert({ user_id: userData.user.id, token, updated_at: new Date().toISOString() });
  } catch (err) {
    // Offline or push not configured (e.g. Expo Go) — try again next launch.
    console.log('Could not register push token', err);
  }
}

export async function removePushToken() {
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await supabase.from('push_tokens').delete().eq('user_id', userData.user.id);
  }
}

export async function scheduleDailyReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Pact 🚀',
      body: 'Time to check in — your group is waiting 🔥',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelAllReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
