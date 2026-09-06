/**
 * CenterPin — the fixed marker at the centre of the map picker.
 *
 * The map pans under it (Swiggy / Zomato pattern): the pin never moves, the
 * map's centre coordinate is what we geocode. It lifts a little while the map
 * is in motion and drops a ground shadow when it settles.
 *
 * Rendered with `pointerEvents="none"` so drags pass straight through to the map.
 * The component's vertical centre is the pin's tip — parent just centres it.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const PIN = 46;

interface Props {
  /** True while the map camera is moving — lifts the pin, shrinks the shadow. */
  moving?: boolean;
  /** Small bubble above the pin, e.g. "Order will be delivered here". */
  caption?: string;
}

export default function CenterPin({ moving = false, caption }: Props) {
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: moving ? 1 : 0,
      duration: moving ? 120 : 260,
      easing: moving ? Easing.out(Easing.quad) : Easing.bezier(0.2, 0.9, 0.3, 1.2),
      useNativeDriver: true,
    }).start();
  }, [moving, lift]);

  const pinTranslate = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const shadowScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  const shadowOpacity = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] });

  return (
    <View style={styles.wrap} pointerEvents="none">
      {caption ? (
        <View style={styles.caption}>
          <Text style={styles.captionText} numberOfLines={1}>
            {caption}
          </Text>
          <View style={styles.captionTail} />
        </View>
      ) : null}

      <Animated.View
        style={[styles.pin, { transform: [{ translateY: pinTranslate }] }]}
      >
        <Ionicons name="location" size={PIN} color={Colors.foodAccent} />
      </Animated.View>

      <Animated.View
        style={[
          styles.shadow,
          { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }, { scaleY: shadowScale }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 220,
    height: 140,
    alignItems: 'center',
    // Centre of this box == pin tip. Parent centres the box on the map centre.
    justifyContent: 'center',
  },
  pin: {
    position: 'absolute',
    // Tip of the Ionicons pin sits ~2px above the glyph's bottom edge.
    bottom: 140 / 2 - 2,
    alignItems: 'center',
  },
  shadow: {
    position: 'absolute',
    top: 140 / 2 - 2,
    width: 20,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.locPinShadow,
  },
  caption: {
    position: 'absolute',
    bottom: 140 / 2 + PIN - 6,
    backgroundColor: Colors.foodText,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    maxWidth: 220,
  },
  captionText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  captionTail: {
    position: 'absolute',
    bottom: -5,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    backgroundColor: Colors.foodText,
    transform: [{ rotate: '45deg' }],
  },
});
