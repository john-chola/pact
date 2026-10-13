import { DarkTheme, DefaultTheme, router, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationGroupId } from '@/hooks/use-notification-group-id';
import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { syncPushToken } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const scheme = useColorScheme();
  const theme = useTheme();
  const notificationGroupId = useNotificationGroupId();

  const signedIn = !!session;
  const onboarded = !!profile?.name;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  useEffect(() => {
    if (signedIn) syncPushToken();
  }, [signedIn]);

  // Tapping a nudge notification opens that group's feed.
  useEffect(() => {
    if (!loading && signedIn && onboarded && notificationGroupId) {
      router.push({ pathname: '/feed/[groupId]', params: { groupId: notificationGroupId } });
    }
  }, [loading, signedIn, onboarded, notificationGroupId]);

  if (loading) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="index" />
          <Stack.Screen name="groups" />
          <Stack.Screen name="feed/[groupId]" />
          <Stack.Screen name="sprint-complete/[groupId]" />
          <Stack.Screen name="notifications" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
