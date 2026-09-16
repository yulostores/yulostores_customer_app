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
          <View style={styles.logoDot}>
            <Ionicons name="storefront" size={22} color={Colors.authAccent} />
          </View>

          <Text style={styles.title}>Enter your number</Text>
          <Text style={styles.subtitle}>
            We&apos;ll send a verification code to confirm it&apos;s you.
          </Text>

          <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
            <Text style={styles.dialCode}>{DEFAULT_DIAL_CODE}</Text>
            <View style={styles.divider} />
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
        </View>

        <View style={styles.footer}>
          <Text style={styles.terms}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
          <Pressable
            style={[styles.cta, (!isValid || submitting || startingGuest) && styles.ctaDisabled]}
            onPress={onContinue}
            disabled={!isValid || submitting || startingGuest}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.authAccentText} />
            ) : (
              <Text style={styles.ctaText}>Continue</Text>
            )}
          </Pressable>

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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
  },
  logoDot: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.authSurface,
    borderWidth: 1,
    borderColor: Colors.authBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.authText,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.authTextMuted,
    marginTop: Spacing.sm,
    marginBottom: Spacing['2xl'],
    lineHeight: 21,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.authField,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.authBorder,
    paddingHorizontal: Spacing.base,
    height: 58,
  },
  inputRowError: { borderColor: Colors.authDanger },
  dialCode: { fontSize: 17, fontWeight: '700', color: Colors.authText },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.authBorder,
    marginHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.authText,
    letterSpacing: 1,
    padding: 0,
  },
  errorText: {
    color: Colors.authDanger,
    fontSize: 13,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.base,
    gap: Spacing.base,
  },
  terms: {
    fontSize: 12,
    color: Colors.authTextMuted,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: Spacing.base,
  },
  cta: {
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.authAccent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.authAccent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  ctaDisabled: {
    backgroundColor: Colors.authBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.authAccentText,
    letterSpacing: 0.3,
  },
  guestBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.authText,
    textDecorationLine: 'underline',
  },
});
