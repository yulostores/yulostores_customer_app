import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  DEFAULT_DIAL_CODE,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
} from '../src/constants/config';
import { BorderRadius, Spacing } from '../src/constants/Theme';
import { useAuth } from '../src/context/AuthContext';
import { logger, reportError } from '../src/lib/logger';
import { AuthError, requestOtp, verifyOtp } from '../src/services/auth';

function formatPhone(raw: string): string {
  return raw.length === 10 ? `${raw.slice(0, 5)} ${raw.slice(5)}` : raw;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    dialCode?: string;
    bypass?: string;
    offline?: string;
    devOtp?: string;
    intent?: string;
  }>();

  const phone = params.phone ?? '';
  const dialCode = params.dialCode ?? DEFAULT_DIAL_CODE;

  const { session, isGuest, signIn } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [isBypass, setIsBypass] = useState(params.bypass === '1');
  const [isOffline, setIsOffline] = useState(params.offline === '1');
  const [devOtp, setDevOtp] = useState(params.devOtp || '');
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_RESEND_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete = code.length === OTP_LENGTH;

  // Resend countdown. Skipped in bypass mode — there is no SMS to wait for.
  useEffect(() => {
    if (isBypass || secondsLeft <= 0) return;
    const id = setInterval(
      () => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [isBypass, secondsLeft]);

  const subtitle = useMemo(() => {
    if (isBypass) {
      return `SMS is off right now — enter any ${OTP_LENGTH} digits to continue.`;
    }
    return `Sent via SMS to ${dialCode} ${formatPhone(phone)}`;
  }, [isBypass, dialCode, phone]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  const onVerify = async () => {
    if (!isComplete || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      // Carry the current guest session's REFRESH token along (if there is one) so
      // the backend can upgrade/merge it instead of starting a fresh account — see
      // src/services/auth.ts's verifyOtp and yulo_backend's guestAccount.service.js.
      // The refresh token, not the access token: the access token is only good for
      // 15 minutes and a guest can easily spend longer than that deciding to buy
      // something before signing in.
      const guestToken = isGuest && session?.refreshToken ? session.refreshToken : undefined;
      const result = await verifyOtp(phone, code, guestToken);
      signIn(result);
      // Signing in as a real customer drops this screen from the navigator (see
      // app/_layout.tsx's guard), which normally falls back to wherever the
      // (tabs) stack already was. That's fine on its own — except a guest who
      // got here via the checkout gate (app/(tabs)/cart.tsx) needs to land back
      // on /checkout specifically, not wherever cart/tabs was left.
      if (params.intent === 'checkout') router.replace('/checkout');
    } catch (err) {
      if (err instanceof AuthError) {
        logger.warn('auth', 'verifyOtp rejected on verify screen', { code: err.code, status: err.status });
      } else {
        reportError('auth', 'Unexpected error verifying OTP', err);
      }
      setError(
        err instanceof AuthError ? err.message : 'Could not verify that code.',
      );
      setCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (resending || (!isBypass && secondsLeft > 0)) return;
    setResending(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      setIsBypass(result.otpBypass);
      setIsOffline(result.offline);
      setDevOtp(result.devOtp ?? '');
      setSecondsLeft(OTP_RESEND_SECONDS);
      setCode('');
      inputRef.current?.focus();
    } catch (err) {
      if (err instanceof AuthError) {
        logger.warn('auth', 'OTP resend rejected on verify screen', { code: err.code, status: err.status });
      } else {
        reportError('auth', 'Unexpected error resending OTP', err);
      }
      setError(
        err instanceof AuthError ? err.message : 'Could not resend the code.',
      );
    } finally {
      setResending(false);
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
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.authText} />
          </Pressable>

          <Text style={styles.title}>Enter the OTP</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Pressable
            style={styles.otpRow}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => {
              const char = code[i] ?? '';
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.otpBox,
                    (active || char) && styles.otpBoxActive,
                    error ? styles.otpBoxError : null,
                  ]}
                >
                  <Text style={styles.otpChar}>{char}</Text>
                </View>
              );
            })}

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
              autoFocus
              caretHidden
            />
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.resendRow}>
            <Text style={styles.resendMuted}>Didn&apos;t get the code? </Text>
            {isBypass ? (
              <Text style={styles.resendMuted}>No SMS will arrive.</Text>
            ) : secondsLeft > 0 ? (
              <Text style={styles.resendMuted}>Resend in {mmss(secondsLeft)}</Text>
            ) : (
              <Pressable onPress={onResend} disabled={resending} hitSlop={8}>
                <Text style={styles.resendLink}>
                  {resending ? 'Sending…' : 'Resend code'}
                </Text>
              </Pressable>
            )}
          </View>

          {isBypass ? (
            <Pressable
              onPress={onResend}
              disabled={resending}
              style={styles.bypassResend}
            >
              <Ionicons name="refresh" size={13} color={Colors.authTextMuted} />
              <Text style={styles.bypassResendText}>
                {resending ? 'Refreshing…' : 'Refresh session'}
              </Text>
            </Pressable>
          ) : null}

          {isOffline ? (
            <Text style={styles.note}>
              Server unreachable — using offline trial login.
            </Text>
          ) : null}
          {devOtp ? <Text style={styles.note}>Dev code: {devOtp}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.cta,
              (!isComplete || verifying) && styles.ctaDisabled,
            ]}
            onPress={onVerify}
            disabled={!isComplete || verifying}
          >
            {verifying ? (
              <ActivityIndicator color={Colors.authAccentText} />
            ) : (
              <Text style={styles.ctaText}>Verify &amp; continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BOX_GAP = 12;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.authBg },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
  },
  back: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    marginLeft: -8,
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
  otpRow: { flexDirection: 'row', gap: BOX_GAP },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 64,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.authBorder,
    backgroundColor: Colors.authField,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: Colors.authAccent,
    borderWidth: 2,
    shadowColor: Colors.authAccent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  otpBoxError: { borderColor: Colors.authDanger },
  otpChar: { fontSize: 24, fontWeight: '800', color: Colors.authText },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  errorText: {
    color: Colors.authDanger,
    fontSize: 13,
    marginTop: Spacing.md,
    marginLeft: Spacing.xs,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: Spacing.xl,
  },
  resendMuted: { fontSize: 14, color: Colors.authTextMuted },
  resendLink: { fontSize: 14, fontWeight: '700', color: Colors.authAccent },
  bypassResend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.md,
  },
  bypassResendText: { fontSize: 13, color: Colors.authTextMuted },
  note: { fontSize: 12, color: Colors.authTextMuted, marginTop: Spacing.md },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.base,
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
});
