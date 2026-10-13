import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
    cancelAllReminders,
    requestNotificationPermissions,
    scheduleDailyReminder,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

const HOURS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
const MINUTES = [0, 15, 30, 45];

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const displayMinute = minute < 10 ? `0${minute}` : minute;
  return `${displayHour}:${displayMinute} ${period}`;
}

export default function NotificationsScreen() {
  const [selectedHour, setSelectedHour] = useState(20);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('profiles')
      .select('reminder_hour, reminder_minute, reminders_enabled')
      .eq('id', userData.user?.id)
      .single();

    if (data) {
      setSelectedHour(data.reminder_hour ?? 20);
      setSelectedMinute(data.reminder_minute ?? 0);
      setEnabled(!!data.reminders_enabled);
    }
  }

  async function handleSave() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const granted = await requestNotificationPermissions();

    if (!granted) {
      alert('Could not get notification permission. Please enable notifications in your phone settings.');
      setLoading(false);
      return;
    }

    await scheduleDailyReminder(selectedHour, selectedMinute);

    await supabase
      .from('profiles')
      .update({
        reminders_enabled: true,
        reminder_hour: selectedHour,
        reminder_minute: selectedMinute,
      })
      .eq('id', userId);

    setEnabled(true);
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDisable() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    await cancelAllReminders();

    await supabase
      .from('profiles')
      .update({ reminders_enabled: false })
      .eq('id', userId);

    setEnabled(false);
    setLoading(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>

          <ThemedView style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="small" themeColor="textSecondary">← Back</ThemedText>
            </Pressable>
            <ThemedText type="title">Reminders 🔔</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Set a daily reminder to check in with your group
            </ThemedText>
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            REMINDER HOUR
          </ThemedText>
          <ThemedView style={styles.row}>
            {HOURS.map((h) => (
              <Pressable
                key={h}
                style={[styles.chip, selectedHour === h && styles.chipActive]}
                onPress={() => setSelectedHour(h)}>
                <ThemedText style={styles.chipText}>
                  {h > 12 ? h - 12 : h}{h >= 12 ? 'pm' : 'am'}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            REMINDER MINUTE
          </ThemedText>
          <ThemedView style={styles.row}>
            {MINUTES.map((m) => (
              <Pressable
                key={m}
                style={[styles.chip, selectedMinute === m && styles.chipActive]}
                onPress={() => setSelectedMinute(m)}>
                <ThemedText style={styles.chipText}>
                  :{m < 10 ? `0${m}` : m}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>

          <ThemedView style={styles.preview}>
            <ThemedText style={styles.previewText}>
              🔔 Daily reminder at {formatTime(selectedHour, selectedMinute)}
            </ThemedText>
          </ThemedView>

          {enabled ? (
            <>
              <ThemedView style={styles.activeBox}>
                <ThemedText style={styles.activeText}>
                  ✅ Reminders active — {formatTime(selectedHour, selectedMinute)} daily
                </ThemedText>
              </ThemedView>
              <Pressable style={styles.button} onPress={handleSave} disabled={loading}>
                <ThemedText style={styles.buttonText}>
                  {loading ? 'Saving...' : saved ? 'Saved! ✅' : 'Update Time'}
                </ThemedText>
              </Pressable>
              <Pressable style={styles.buttonOutline} onPress={handleDisable}>
                <ThemedText>Turn Off Reminders</ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.button} onPress={handleSave} disabled={loading}>
              <ThemedText style={styles.buttonText}>
                {loading ? 'Setting up...' : 'Enable Daily Reminder'}
              </ThemedText>
            </Pressable>
          )}

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  header: { gap: Spacing.two, marginBottom: Spacing.four },
  center: { textAlign: 'center' },
  sectionLabel: { marginTop: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  chip: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  chipActive: { backgroundColor: '#22c55e' },
  chipText: { fontSize: 13 },
  preview: {
    backgroundColor: '#1a1a1a',
    padding: Spacing.three,
    borderRadius: 12,
    marginTop: Spacing.four,
    alignItems: 'center',
  },
  previewText: { fontSize: 16 },
  activeBox: {
    backgroundColor: '#052e16',
    padding: Spacing.three,
    borderRadius: 12,
    marginTop: Spacing.three,
    alignItems: 'center',
  },
  activeText: { color: '#22c55e' },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonText: { color: '#000', fontWeight: 'bold' },
});