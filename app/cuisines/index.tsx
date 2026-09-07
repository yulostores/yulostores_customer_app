/**
 * app/cuisines/index.tsx — "Browse by cuisine", reached from Home's
 * "What's on your mind?" section.
 *
 * The list is `GET /api/cuisines` (src/services/cuisines.ts) — a name and a
 * restaurant count, nothing else. Tapping a row routes to `/search?query=`,
 * the same mechanism the home feed's own cuisine chips already use: the
 * restaurant list endpoint matches `q` against name OR cuisine server-side, so
 * no separate cuisine filter is needed on the client or the backend.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useCuisines } from '../../src/hooks/useCuisines';
import type { Cuisine } from '../../src/services/cuisines';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

function CuisineRow({ cuisine }: { cuisine: Cuisine }) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push({ pathname: '/search', params: { query: cuisine.name } })}
    >
      <View style={styles.iconBubble}>
        <Ionicons name="restaurant-outline" size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{cuisine.name}</Text>
        <Text style={styles.rowMeta}>
          {cuisine.restaurantCount} {cuisine.restaurantCount === 1 ? 'restaurant' : 'restaurants'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

export default function CuisinesScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { cuisines, loading, error, refresh } = useCuisines();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Browse by cuisine</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.foodBorder} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : cuisines.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="restaurant-outline" size={48} color={Colors.foodBorder} />
          <Text style={styles.errorText}>No cuisines to show yet.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {cuisines.map((c) => (
            <CuisineRow key={c.name} cuisine={c} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorText: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  list: { padding: Spacing.base, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: t.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.foodText },
  rowMeta: { fontSize: 12.5, color: Colors.foodTextMuted, marginTop: 2 },
  });

const styles = makeStyles(ORANGE_ACCENT);
