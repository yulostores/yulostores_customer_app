import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../src/constants/Colors';
import { BorderRadius, Spacing } from '../src/constants/Theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <LinearGradient colors={[Colors.bgDark, Colors.bgMid]} style={styles.container}>
        <Ionicons name="warning-outline" size={64} color={Colors.primaryLight} />
        <Text style={styles.title}>Page Not Found</Text>
        <Text style={styles.sub}>The screen you're looking for doesn't exist.</Text>
        <Link href="/" asChild>
          <Pressable style={styles.btn}>
            <Text style={styles.btnText}>Go Back Home</Text>
          </Pressable>
        </Link>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.base,
    padding: Spacing['2xl'],
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.white },
  sub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  btn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.full,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
