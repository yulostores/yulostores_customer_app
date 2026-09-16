import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../src/constants/Colors';
import { BorderRadius } from '../src/constants/Theme';
import { useOnboarding } from '../src/context/OnboardingContext';

const BLOB = require('../assets/Images/onboarding/blob.png');
const BLOB_BOTTOM = require('../assets/Images/onboarding/blob-bottom.png');
const BLOB_BOTTOM_RATIO = 328 / 893;

const SLIDES = [
  {
    key: 'discover',
    art: require('../assets/Images/onboarding/art-1.png'),
    title: 'Discover places near you',
    body: 'Finding the food you crave is simple — set your address and let us do the rest.',
  },
  {
    key: 'everything',
    art: require('../assets/Images/onboarding/art-2.png'),
    title: 'Everything delivered',
    body: 'Meals, groceries, gifts, toys, bags and more — all from one app.',
  },
  {
    key: 'fast',
    art: require('../assets/Images/onboarding/art-3.png'),
    title: 'Fast delivery to your door',
    body: 'Track your order live and get everything delivered fresh and fast.',
  },
] as const;

const LAST = SLIDES.length - 1;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { complete } = useOnboarding();

  const scrollRef = useRef<ScrollView>(null);
  // Native-driven: slide transforms, copy crossfades. Kept off the JS thread so
  // the swipe stays at 60fps.
  const scrollX = useRef(new Animated.Value(0)).current;
  // JS-driven twin: the pagination dots animate width + colour, neither of which
  // the native driver supports.
  const progressX = useRef(new Animated.Value(0)).current;
  const mount = useRef(new Animated.Value(0)).current;

  const [index, setIndex] = useState(0);
  const [pagerH, setPagerH] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const blobH = Math.round(width * 0.34);
  const blobBottomW = Math.round(width * 0.56);
  const blobBottomH = Math.round(blobBottomW * BLOB_BOTTOM_RATIO);
  const artSize = Math.round(Math.min(width * 0.72, height * 0.3, 300));
  const headingSize = clamp(width * 0.076, 23, 31);
  const bodySize = clamp(width * 0.039, 13.5, 16);
  const textBlockH = clamp(height * 0.21, 138, 182);

  // Respect the OS "reduce motion" setting, mirroring BrandSplash.
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => {
        if (!active) return;
        setReduceMotion(rm);
        if (rm) mount.setValue(1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mount]);

  // Content settles up once on entry.
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(mount, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mount, reduceMotion]);

  // Android hardware back steps through the carousel before leaving it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) {
        scrollRef.current?.scrollTo({ x: width * (index - 1), animated: true });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [index, width]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const x = e.nativeEvent.contentOffset.x;
          progressX.setValue(x);
          const next = Math.round(x / width);
          setIndex((cur) => (cur === next ? cur : next));
        },
      }),
    [scrollX, progressX, width],
  );

  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerH(e.nativeEvent.layout.height);
  }, []);

  const finish = useCallback(async () => {
    await complete();
    router.replace('/sign-in');
  }, [complete]);

  const onPrimary = useCallback(() => {
    if (index >= LAST) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
  }, [index, width, finish]);

  const isLast = index >= LAST;

  const ctaFadeRange = [width * (LAST - 1), width * LAST];
  const nextOpacity = scrollX.interpolate({
    inputRange: ctaFadeRange,
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const startedOpacity = scrollX.interpolate({
    inputRange: ctaFadeRange,
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const skipOpacity = scrollX.interpolate({
    inputRange: ctaFadeRange,
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // "Everything delivered" (index 1) is the only slide with the bottom accent shape.
  const blobBottomOpacity = scrollX.interpolate({
    inputRange: [0, width, 2 * width],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <Image
        source={BLOB}
        style={[styles.blob, { height: blobH }]}
        resizeMode="cover"
      />

      <Animated.Image
        source={BLOB_BOTTOM}
        style={[
          styles.blobBottom,
          { width: blobBottomW, height: blobBottomH, opacity: blobBottomOpacity },
        ]}
        resizeMode="contain"
      />

      <Animated.View
        style={[
          styles.flex,
          {
            opacity: mount,
            transform: [
              {
                translateY: mount.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.flex} onLayout={onPagerLayout}>
          <Animated.ScrollView
            ref={scrollRef}
            style={styles.flex}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {SLIDES.map((slide, i) => {
              const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
              const artStyle = reduceMotion
                ? undefined
                : {
                    opacity: scrollX.interpolate({
                      inputRange,
                      outputRange: [0.6, 1, 0.6],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        translateX: scrollX.interpolate({
                          inputRange,
                          outputRange: [width * 0.14, 0, -width * 0.14],
                          extrapolate: 'clamp',
                        }),
                      },
                      {
                        scale: scrollX.interpolate({
                          inputRange,
                          outputRange: [0.94, 1, 0.94],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  };
              const textStyle = reduceMotion
                ? undefined
                : {
                    opacity: scrollX.interpolate({
                      inputRange,
                      outputRange: [0, 1, 0],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        translateY: scrollX.interpolate({
                          inputRange,
                          outputRange: [16, 0, 16],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  };

              return (
                <View
                  key={slide.key}
                  style={{ width, height: pagerH }}
                  accessible
                  accessibilityLabel={`${slide.title}. ${slide.body}`}
                >
                  <View style={[styles.artArea, { paddingTop: blobH * 0.55 }]}>
                    <Animated.Image
                      source={slide.art}
                      style={[{ width: artSize, height: artSize }, artStyle]}
                      resizeMode="contain"
                    />
                  </View>

                  <Animated.View
                    style={[styles.textBlock, { height: textBlockH }, textStyle]}
                  >
                    <Text
                      style={[
                        styles.heading,
                        { fontSize: headingSize, lineHeight: headingSize * 1.16 },
                      ]}
                      maxFontSizeMultiplier={1.25}
                    >
                      {slide.title}
                    </Text>
                    <Text
                      style={[styles.body, { fontSize: bodySize }]}
                      maxFontSizeMultiplier={1.4}
                    >
                      {slide.body}
                    </Text>
                  </Animated.View>
                </View>
              );
            })}
          </Animated.ScrollView>
        </View>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom > 0 ? 12 : 20 }]}
        >
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <Dot key={s.key} progressX={progressX} i={i} width={width} />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={onPrimary}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next'}
          >
            <Animated.Text style={[styles.ctaText, { opacity: nextOpacity }]}>
              Next
            </Animated.Text>
            <Animated.Text
              style={[styles.ctaText, styles.ctaTextAbs, { opacity: startedOpacity }]}
            >
              Get Started
            </Animated.Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.skipWrap, { opacity: skipOpacity }]}
        pointerEvents={isLast ? 'none' : 'auto'}
      >
        <Pressable
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

function Dot({
  progressX,
  i,
  width,
}: {
  progressX: Animated.Value;
  i: number;
  width: number;
}) {
  const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
  const dotWidth = progressX.interpolate({
    inputRange,
    outputRange: [7, 22, 7],
    extrapolate: 'clamp',
  });
  const opacity = progressX.interpolate({
    inputRange,
    outputRange: [0.5, 1, 0.5],
    extrapolate: 'clamp',
  });
  const backgroundColor = progressX.interpolate({
    inputRange,
    outputRange: [
      Colors.onbDotInactive,
      Colors.onbDotActive,
      Colors.onbDotInactive,
    ],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{ width: dotWidth, height: 7, borderRadius: 4, backgroundColor, opacity }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.onbBg },
  flex: { flex: 1 },
  blob: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
  },
  blobBottom: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  artArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  heading: {
    fontWeight: '800',
    color: Colors.onbHeading,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  body: {
    marginTop: 12,
    color: Colors.onbBody,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 20,
    marginBottom: 18,
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
  ctaPressed: { opacity: 0.9 },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.authAccentText,
    letterSpacing: 0.3,
  },
  ctaTextAbs: { position: 'absolute' },
  skipWrap: {
    position: 'absolute',
    top: 8,
    right: 20,
  },
  skip: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.onbSkip,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
