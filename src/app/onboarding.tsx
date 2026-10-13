import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Input, Row, Screen, SectionLabel, showMessage } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const GOALS = [
  'Ship an MVP',
  'Finish a side project',
  'Learn a new stack',
  'Build a coding habit',
  'Prep for interviews',
];

export default function OnboardingScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [building, setBuilding] = useState(profile?.what_im_building ?? '');
  const [goal, setGoal] = useState(profile?.goal ?? '');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    const userId = session?.user.id;
    if (!userId) return;
    if (!name.trim()) {
      showMessage('What should your group call you?');
      return;
    }

    setLoading(true);
    const fields = {
      name: name.trim(),
      what_im_building: building.trim() || null,
      goal: goal.trim() || null,
    };
    const { error } = profile
      ? await supabase.from('profiles').update(fields).eq('id', userId)
      : await supabase.from('profiles').insert({ id: userId, ...fields });

    if (error) {
      setLoading(false);
      showMessage('Could not save', error.message);
      return;
    }
    // Once the profile has a name the root layout swaps to the home screen.
    await refreshProfile();
    setLoading(false);
  }

  return (
    <Screen centered>
      <ThemedText type="subtitle">Welcome to Pact 👋</ThemedText>
      <ThemedText themeColor="textSecondary">
        Three quick questions so your group knows who you are.
      </ThemedText>

      <Input label="Your name" placeholder="e.g. John" value={name} onChangeText={setName} />
      <Input
        label="What are you building?"
        placeholder="e.g. A budgeting app for students"
        value={building}
        onChangeText={setBuilding}
      />

      <SectionLabel>Your goal for this sprint</SectionLabel>
      <Row>
        {GOALS.map((g) => (
          <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal(goal === g ? '' : g)} />
        ))}
      </Row>
      <Input placeholder="…or write your own" value={GOALS.includes(goal) ? '' : goal} onChangeText={setGoal} />

      <Button title="Let's go" onPress={handleContinue} loading={loading} style={styles.cta} />
      <Pressable onPress={signOut} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Use a different account
        </ThemedText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.two },
  center: { textAlign: 'center' },
});
