import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Checkin = {
  id: string;
  worked_on: string;
  duration_minutes: number;
  honest_feeling: string;
  tomorrow_plan: string;
  created_at: string;
  user_id: string;
  profiles?: { name: string };
};

export default function FeedScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [streak, setStreak] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [workedOn, setWorkedOn] = useState('');
  const [duration, setDuration] = useState('');
  const [feeling, setFeeling] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<any>(null);

  async function loadCheckins() {
    const { data, error } = await supabase
      .from('checkins')
      .select('*, profiles(name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCheckins(data as any);
    }
  }

  async function loadStreak() {
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('profiles')
      .select('streak_count')
      .eq('id', userData.user?.id)
      .single();

    if (data) setStreak(data.streak_count);
  }

  useEffect(() => {
    if (!groupId) return;
  
    loadCheckins();
    loadStreak();
  
    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  
    const channel = supabase
      .channel(`group-${groupId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'checkins',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          supabase
            .from('checkins')
            .select('*, profiles(name)')
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setCheckins((prev) => [data as any, ...prev]);
              }
            });
        }
      )
      .subscribe();
  
    channelRef.current = channel;
  
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [groupId]);

  async function handleSubmit() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('checkins').insert({
      group_id: groupId,
      user_id: userId,
      worked_on: workedOn,
      duration_minutes: parseInt(duration) || 0,
      honest_feeling: feeling,
      tomorrow_plan: tomorrowPlan,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    await supabase.rpc('update_streak', { user_id: userId });

    setWorkedOn('');
    setDuration('');
    setFeeling('');
    setTomorrowPlan('');
    setShowForm(false);
    setLoading(false);
    loadStreak();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>

        <ThemedView style={styles.header}>
          <ThemedText type="title">Pact 🚀</ThemedText>
          <Pressable onPress={() => router.replace('/home')}>
            <ThemedText type="small" themeColor="textSecondary">
              Home
            </ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.streakBar}>
          <ThemedText style={styles.streakText}>
            🔥 {streak} day streak
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Keep showing up
          </ThemedText>
        </ThemedView>

        {showForm ? (
          <ThemedView style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="💻 What I worked on"
              placeholderTextColor="#666"
              value={workedOn}
              onChangeText={setWorkedOn}
            />
            <TextInput
              style={styles.input}
              placeholder="⏱ How long (minutes)"
              placeholderTextColor="#666"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="😓 Honest feeling"
              placeholderTextColor="#666"
              value={feeling}
              onChangeText={setFeeling}
            />
            <TextInput
              style={styles.input}
              placeholder="🎯 Tomorrow's plan"
              placeholderTextColor="#666"
              value={tomorrowPlan}
              onChangeText={setTomorrowPlan}
            />
            <Pressable
              style={styles.button}
              onPress={handleSubmit}
              disabled={loading}>
              <ThemedText style={styles.buttonText}>
                {loading ? 'Posting...' : 'Post Check-in'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setShowForm(false)}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Cancel
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <Pressable style={styles.button} onPress={() => setShowForm(true)}>
            <ThemedText style={styles.buttonText}>+ Daily Check-in</ThemedText>
          </Pressable>
        )}

        <FlatList
          style={styles.list}
          data={checkins}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              No check-ins yet. Be the first 💪
            </ThemedText>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText style={styles.cardName}>
                {item.profiles?.name || 'Someone'}
              </ThemedText>
              <ThemedText type="small">💻 {item.worked_on}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                ⏱ {item.duration_minutes} min
              </ThemedText>
              <ThemedText type="small">😓 {item.honest_feeling}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                🎯 {item.tomorrow_plan}
              </ThemedText>
            </ThemedView>
          )}
        />

      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakBar: {
    backgroundColor: '#1a1a1a',
    padding: Spacing.three,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  form: { gap: Spacing.two },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
  },
  center: { textAlign: 'center' },
  button: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#000', fontWeight: 'bold' },
  list: { flex: 1, marginTop: Spacing.two },
  card: {
    padding: Spacing.three,
    borderRadius: 12,
    marginBottom: Spacing.two,
    gap: 4,
  },
  cardName: { fontWeight: 'bold', marginBottom: 2 },
});