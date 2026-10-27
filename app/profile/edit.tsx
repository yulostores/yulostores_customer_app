/**
 * app/profile/edit.tsx — edit the customer's name and avatar. The phone is shown
 * read-only: it is the OTP login identity, and changing it here would skip OTP
 * verification entirely (the next login by the real number would then create a
 * fresh, empty account).
 *
 * One write: `PATCH /api/users/me` (src/services/profile.ts → updateProfile).
 * A newly-picked photo rides along as a multipart `avatar` file in the same
 * request; the backend uploads it to Cloudinary and returns the fresh
 * `profilePicture` URL — this screen never talks to Cloudinary directly.
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionButton from '../../src/components/location/ActionButton';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useProfile } from '../../src/hooks/useProfile';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { initialsFor, updateProfile, type AvatarFile } from '../../src/services/profile';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { profile, isLoading, isFresh, error: loadError, notSignedIn, refresh } = useProfile();

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once, from the server's copy — the session seed useProfile
  // paints first can carry a stale name (rename A→B, reopen → it still says A,
  // and Save would write A back). If the fetch fails (or there's no server
  // account to read), fall back to whatever is showing so the form is usable. The ref keeps later refreshes from
  // clobbering what's typed.
  const seededRef = useRef(false);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seededRef.current || !profile) return;
    if (!isFresh && !loadError && !notSignedIn) return;
    seededRef.current = true;
    setName(profile.name);
    setSeeded(true);
  }, [profile, isFresh, loadError, notSignedIn]);

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      setAvatar({
        uri: asset.uri,
        name: `avatar.${ext}`,
        type: asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      });
    } catch (err) {
      reportError('profile', 'Avatar picker failed', err);
      Alert.alert('Something went wrong', 'Could not open your photo library.');
    }
  };

  const canSave = name.trim().length >= 2 && !saving && seeded;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ name: name.trim() }, avatar ?? undefined);
      // Never throws (useProfile handles its own errors); the Profile tab also
      // refetches when it regains focus.
      await refresh();
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('profile', `Update profile rejected — ${err.status} ${err.code}`, { code: err.code });
      } else {
        reportError('profile', 'Failed to update profile', err);
      }
      setError(
        err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const avatarUri = avatar?.uri ?? profile?.avatarUrl ?? null;
  const initials = profile ? initialsFor({ name: name.trim() || profile.name }) : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          <View style={styles.avatarSection}>
            <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
              {avatarUri ? (
                <RemoteImage uri={avatarUri} style={styles.avatar} icon="person" iconSize={30} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  {initials ? (
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  ) : (
                    <Ionicons name="person" size={30} color={Colors.white} />
                  )}
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color={Colors.white} />
              </View>
            </Pressable>
            <Pressable onPress={pickAvatar} hitSlop={8}>
              <Text style={styles.changePhotoText}>Change photo</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.fieldLabel}>
            Full name<Text style={{ color: accent }}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={Colors.foodTextMuted}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Phone</Text>
          {/* Read-only: the phone is the verified login identity. */}
          <View style={[styles.input, styles.inputReadOnly]}>
            <Text style={styles.readOnlyText} numberOfLines={1}>
              {profile?.phone ?? '—'}
            </Text>
            <Ionicons name="lock-closed" size={16} color={Colors.foodTextMuted} />
          </View>

          {(isLoading || !seeded) && !loadError && !notSignedIn ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.foodTextMuted} />
              <Text style={styles.loadingText}>Loading your profile…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.base }]}>
          <ActionButton label="Save changes" onPress={onSave} loading={saving} disabled={!canSave} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText },

  body: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['3xl'] },

  avatarSection: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  avatarWrap: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: BorderRadius.full },
  avatarFallback: { backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '800', color: Colors.white, letterSpacing: 0.5 },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.foodSurface,
  },
  changePhotoText: { fontSize: 13.5, fontWeight: '700', color: t.accent },

  errorText: {
    fontSize: 13,
    color: Colors.authDanger,
    marginBottom: Spacing.md,
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.foodTextSecondary, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorderStrong,
    paddingHorizontal: Spacing.base,
    fontSize: 14.5,
    color: Colors.foodText,
    backgroundColor: Colors.foodSurface,
  },
  inputReadOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderColor: Colors.foodBorder,
  },
  readOnlyText: { flex: 1, fontSize: 14.5, color: Colors.foodTextSecondary },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg },
  loadingText: { fontSize: 13, color: Colors.foodTextMuted },

  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    // Plus the bottom safe-area inset, applied inline — the screen draws edge to edge.
    paddingBottom: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
    ...Elevation.sticky,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
