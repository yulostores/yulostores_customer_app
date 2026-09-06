import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';

const APP_NAME = 'Yulo Stores';
const TAGLINE = 'Good food, delivered with care';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface BrandSplashProps {
  /** Fires once the intro animation (and its hold) has finished. */
  onFinish?: () => void;
  /** How long the fully-revealed screen stays on-screen before `onFinish`. */
  holdDuration?: number;
}

/**
 * Full-bleed branded launch screen. Mobile-first, scales fluidly across phone
 * sizes and both orientations, and respects the OS "reduce motion" setting.
 */
export default function BrandSplash({
  onFinish,
  holdDuration = 900,
}: BrandSplashProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Size everything off the shortest edge so portrait & landscape both hold up.
  const shortestEdge = Math.min(width, height);
  const titleSize = Math.round(clamp(shortestEdge * 0.093, 28, 52));
  const taglineSize = Math.round(clamp(shortestEdge * 0.039, 13, 20));

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const loaderSpin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    let loaderLoop: Animated.CompositeAnimation | undefined;

    const runIntro = (reduceMotion: boolean) => {
      if (reduceMotion) {
        fade.setValue(1);
        rise.setValue(0);
        scale.setValue(1);
      } else {
        Animated.parallel([
          Animated.timing(fade, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(rise, {
            toValue: 0,
            duration: 620,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 7,
            tension: 60,
            useNativeDriver: true,
          }),
        ]).start();

        loaderLoop = Animated.loop(
          Animated.timing(loaderSpin, {
            toValue: 1,
            duration: 900,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        );
        loaderLoop.start();
      }

      const timer = setTimeout(
        () => {
          if (!cancelled) onFinish?.();
        },
        (reduceMotion ? 300 : 700) + holdDuration,
      );

      return timer;
    };

    let timer: ReturnType<typeof setTimeout>;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!cancelled) timer = runIntro(reduceMotion);
      })
      .catch(() => {
        if (!cancelled) timer = runIntro(false);
      });

    return () => {
      cancelled = true;
      loaderLoop?.stop();
      clearTimeout(timer);
    };
  }, [fade, rise, scale, loaderSpin, onFinish, holdDuration]);

  const spin = loaderSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.root} accessibilityRole="image" accessibilityLabel={`${APP_NAME}. ${TAGLINE}`}>
      <LinearGradient
        colors={[Colors.splashBg, Colors.splashBgDeep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.centerBlock}>
        <Animated.View
          style={{
            opacity: fade,
            transform: [{ translateY: rise }, { scale }],
            alignItems: 'center',
          }}
        >
          <Text
            style={[styles.title, { fontSize: titleSize }]}
            maxFontSizeMultiplier={1.3}
            allowFontScaling
          >
            {APP_NAME}
          </Text>
          <Text
            style={[styles.tagline, { fontSize: taglineSize }]}
            maxFontSizeMultiplier={1.4}
            allowFontScaling
          >
            {TAGLINE}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.loaderWrap,
          { opacity: fade, bottom: Math.max(insets.bottom, 24) + 28 },
        ]}
      >
        <Animated.View style={[styles.loader, { transform: [{ rotate: spin }] }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.splashBg,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: Colors.splashTitle,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    color: Colors.splashTagline,
    fontWeight: '500',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  loaderWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    borderColor: Colors.splashLoader,
    borderTopColor: 'transparent',
  },
});
