// Three top-level places (D65): Resumes (library), Profile (the master), Settings. JS tabs, not native tabs: the same
// look and the same accessibility ids on iPhone and Android, and Maestro can tap them by id.
import Tabs from 'expo-router/js-tabs';

import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

export default function TabsLayout() {
  const theme = useTheme();
  const tab = (id: string) => ({ tabBarButtonTestID: `tab-${id}`, tabBarIcon: () => null, tabBarIconStyle: { display: 'none' as const } });
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        tabBarLabelPosition: 'beside-icon',
        tabBarStyle: { backgroundColor: theme.background },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen name="index" options={{ title: t('nav.home'), ...tab('home') }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile'), ...tab('profile') }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings'), ...tab('settings') }} />
    </Tabs>
  );
}
