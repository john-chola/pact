import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BackButton, Button, Card, Chip, Row, Screen, SectionLabel, showMessage } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  cancelAllReminders,
  requestNotificationPermissions,
  scheduleDailyReminder,
  sendTestNotification,
  syncPushToken,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const MINUTES = [0, 15, 30, 45];

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function NotificationsScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const theme = useTheme();
  const [selectedHour, setSelectedHour] = useState(profile?.reminder_hour ?? 20);
  const [selectedMinute, setSelectedMinute] = useState(profile?.reminder_minute ?? 0);
  const [enabled, setEnabled] = useState(!!profile?.reminders_enabled);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const userId = session?.user.id;

  async function handleSave() {
    if (!userId) return;
    setLoading(true);

    const granted = await requestNotificationPermissions();
    if (!granted) {
      setLoading(false);
      showMessage(
        'Notifications are off',
        'Enable notifications for Pact in your phone settings (reminders need a real device).'
      );
      return;
    }

    await scheduleDailyReminder(selectedHour, selectedMinute);
    // Also lets group mates and the daily sweep nudge you.
    await syncPushToken();

    await supabase
      .from('profiles')
      .update({
        reminders_enabled: true,
        reminder_hour: selectedHour,
        reminder_minute: selectedMinute,
      })
      .eq('id', userId);
    await refreshProfile();

    setEnabled(true);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    showMessage(
      'Reminder set ✅',
      `You'll get a notification every day at ${formatTime(selectedHour, selectedMinute)}. Tap "Send test notification" to check it works now.`
    );
  }

  async function handleTest() {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      showMessage('Notifications are off', 'Enable notifications for Pact in your phone settings.');
      return;
    }
    await sendTestNotification();
    showMessage('Test sent', 'Lock your phone or go to the home screen — it arrives in about 5 seconds.');
  }

  async function handleDisable() {
    if (!userId) return;
    setLoading(true);
    await cancelAllReminders();
    await supabase.from('profiles').update({ reminders_enabled: false }).eq('id', userId);
    await refreshProfile();
    setEnabled(false);
    setLoading(false);
  }

  return (
    <Screen>
      <BackButton />
      <ThemedText type="subtitle">Reminders 🔔</ThemedText>
      <ThemedText themeColor="textSecondary">
        Pick a time and we'll remind you to check in with your group every day.
      </ThemedText>

      <SectionLabel>Hour</SectionLabel>
      <Row>
        {HOURS.map((h) => (
          <Chip
            key={h}
            label={`${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? 'pm' : 'am'}`}
            selected={selectedHour === h}
            onPress={() => setSelectedHour(h)}
          />
        ))}
      </Row>

      <SectionLabel>Minute</SectionLabel>
      <Row>
        {MINUTES.map((m) => (
          <Chip
            key={m}
            label={`:${String(m).padStart(2, '0')}`}
            selected={selectedMinute === m}
            onPress={() => setSelectedMinute(m)}
          />
        ))}
      </Row>

      <Card style={enabled ? { backgroundColor: theme.successBackground } : undefined}>
        <ThemedText style={[styles.center, enabled && { color: theme.successText }]}>
          {enabled
            ? `✅ Reminders on — ${formatTime(profile?.reminder_hour ?? selectedHour, profile?.reminder_minute ?? selectedMinute)} daily`
            : `🔔 Daily reminder at ${formatTime(selectedHour, selectedMinute)}`}
        </ThemedText>
      </Card>

      {enabled ? (
        <>
          <Button
            title={saved ? 'Saved! ✅' : `Update to ${formatTime(selectedHour, selectedMinute)}`}
            onPress={handleSave}
            loading={loading}
          />
          <Button title="Turn Off Reminders" variant="outline" onPress={handleDisable} disabled={loading} />
        </>
      ) : (
        <Button title="Enable Daily Reminder" onPress={handleSave} loading={loading} />
      )}

      <Button title="Send test notification" variant="ghost" onPress={handleTest} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Not getting reminders? Make sure notifications are allowed for Pact and battery
        optimization is turned off for it in your phone settings.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
