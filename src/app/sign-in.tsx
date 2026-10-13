import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, Screen, showMessage } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [isSignup, setIsSignup] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showMessage('Enter your email and password');
      return;
    }
    if (isSignup && password.length < 6) {
      showMessage('Password too short', 'Use at least 6 characters.');
      return;
    }

    setLoading(true);
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      setLoading(false);
      if (error) {
        showMessage('Could not sign up', error.message);
      } else if (!data.session) {
        // Email confirmation is on in Supabase → no session until they confirm.
        showMessage('Check your email', 'Confirm your address, then come back and log in.');
        setIsSignup(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      setLoading(false);
      if (error) showMessage('Could not log in', error.message);
    }
    // On success the root layout sees the new session and moves on.
  }

  return (
    <Screen centered>
      <ThemedText type="title" style={styles.center}>
        Pact 🚀
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={[styles.center, styles.tagline]}>
        {isSignup
          ? '7-day sprints with a small crew.\nCheck in daily. Build together.'
          : 'Welcome back'}
      </ThemedText>

      <Input
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        onSubmitEditing={handleAuth}
      />

      <Button
        title={isSignup ? 'Create Account' : 'Log In'}
        onPress={handleAuth}
        loading={loading}
      />

      <Pressable onPress={() => setIsSignup(!isSignup)} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
        </ThemedText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  tagline: { marginBottom: Spacing.three },
});
