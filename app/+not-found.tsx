import { Ionicons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../src/constants/Colors';
import { BorderRadius, Spacing } from '../src/constants/Theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <View style={styles.iconBubble}>
          <Ionicons name="compass-outline" size={44} color={Colors.foodAccent} />
        </View>
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.sub}>
          The screen you&apos;re looking for doesn&apos;t exist.
        </Text>
        <Link href="/" asChild>
          <Pressable style={styles.btn}>
            <Text style={styles.btnText}>Go back home</Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

// This screen was the last one still painted in the retired dark-purple theme —
// a customer who mistyped a link landed on a screen from a different app.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.base,
    padding: Spacing['2xl'],
    backgroundColor: Colors.foodBg,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.foodAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
  },
  btn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.full,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
