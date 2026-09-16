import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../src/constants/Colors';
import { DEFAULT_DIAL_CODE, PHONE_NUMBER_LENGTH } from '../src/constants/config';
import { BorderRadius, Spacing } from '../src/constants/Theme';
import { useAuth } from '../src/context/AuthContext';
import { logger, reportError } from '../src/lib/logger';
import { AuthError, requestOtp } from '../src/services/auth';

export default function SignInScreen() {
  // `intent=checkout` arrives when a guest hit this screen from the cart's
  // "Proceed to checkout" gate (app/(tabs)/cart.tsx) — carried through to
  // verify-otp so it can land the customer straight back on /checkout instead of
  // wherever the tab stack happened to be.
  const params = useLocalSearchParams<{ intent?: string }>();
  const { isGuest, signInAsGuest } = useAuth();

  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingGuest, setStartingGuest] = useState(false);

  const isValid = phone.length === PHONE_NUMBER_LENGTH;

  const onContinue = async () => {
    if (!isValid || submitting || startingGuest) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      router.push({
        pathname: '/verify-otp',
        params: {
          phone,
          dialCode: DEFAULT_DIAL_CODE,
          bypass: result.otpBypass ? '1' : '',
          offline: result.offline ? '1' : '',
          devOtp: result.devOtp ?? '',
          intent: params.intent ?? '',
        },
      });
    } catch (err) {
      if (err instanceof AuthError) {
        logger.warn('auth', 'requestOtp rejected on sign-in screen', { code: err.code, status: err.status });
      } else {
        reportError('auth', 'Unexpected error requesting OTP', err);
      }
      setError(
        err instanceof AuthError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Starts an anonymous session and drops straight into the app. Not offered to
  // someone who's already browsing as a guest — tapping it again would only
  // abandon their current guest cart for a brand-new, empty one. `_layout.tsx`'s
  // guard doesn't drop this screen when a guest signs in (only a real customer
  // does that), so this screen navigates explicitly rather than relying on it.
  const onContinueAsGuest = async () => {
    if (startingGuest || submitting) return;
    setStartingGuest(true);
    setError(null);
    try {
      await signInAsGuest();
      router.replace('/(tabs)');
    } catch (err) {
      if (err instanceof AuthError) {
        logger.warn('auth', 'Guest session request rejected', { code: err.code, status: err.status });
      } else {
        reportError('auth', 'Unexpected error starting a guest session', err);
      }
      setError('Could not start browsing. Please try again.');
    } finally {
      setStartingGuest(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.authText} />
          </Pressable>

          <Text style={styles.wordmark}>YULO STORES</Text>

          <Text style={styles.title}>Enter your mobile number</Text>
          <Text style={styles.subtitle}>
            We&apos;ll send you a one-time code to verify it&apos;s you
          </Text>

          <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
            <Ionicons name="call-outline" size={20} color={Colors.authTextMuted} />
            <Text style={styles.dialCode}>{DEFAULT_DIAL_CODE}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/\D/g, '').slice(0, PHONE_NUMBER_LENGTH));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholder="98765 43210"
              placeholderTextColor={Colors.authTextMuted}
              maxLength={PHONE_NUMBER_LENGTH}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onContinue}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[
              styles.cta,
              (!isValid || submitting || startingGuest) && styles.ctaDisabled,
            ]}
            onPress={onContinue}
            disabled={!isValid || submitting || startingGuest}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.authAccentText} />
            ) : (
              <Text style={styles.ctaText}>Continue</Text>
            )}
          </Pressable>

          <Text style={styles.terms}>
            By continuing, you agree to our Terms &amp; Privacy Policy
          </Text>

          {!isGuest && (
            <Pressable
              style={styles.guestBtn}
              onPress={onContinueAsGuest}
              disabled={startingGuest || submitting}
              accessibilityRole="button"
              accessibilityLabel="Continue as guest"
            >
              {startingGuest ? (
                <ActivityIndicator color={Colors.authText} />
              ) : (
                <Text style={styles.guestBtnText}>Continue as guest</Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.authBg },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.base,
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    marginLeft: -8,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.authWordmark,
    letterSpacing: -0.64,
    marginBottom: Spacing['3xl'],
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.authText,
    letterSpacing: -0.64,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.authTextMuted,
    marginTop: Spacing.sm,
    marginBottom: Spacing['2xl'],
    lineHeight: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.authField,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.authBorder,
    paddingHorizontal: Spacing.lg,
    height: 48,
    gap: Spacing.sm,
  },
  inputRowError: { borderColor: Colors.authDanger },
  dialCode: { fontSize: 16, fontWeight: '600', color: Colors.authText },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.authText,
    padding: 0,
  },
  errorText: {
    color: Colors.authDanger,
    fontSize: 13,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  terms: {
    fontSize: 14,
    color: Colors.authTextMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.base,
  },
  cta: {
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.authAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.authAccent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaDisabled: {
    backgroundColor: Colors.authBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.authAccentText,
  },
  guestBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  guestBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.authText,
    textDecorationLine: 'underline',
  },
});
