/**
 * RemoteImage — a remote <Image> that degrades to a labelled placeholder instead of a
 * blank grey box.
 *
 * A plain `<Image source={{ uri }} />` renders nothing when the URL is missing AND when
 * it fails to load, and the two look identical to the customer. This routes both cases
 * into an icon placeholder that occupies the same footprint the image would have. With
 * `showCaption` it also spells out which case it is — "Image" for a missing source,
 * "Unable to load image" for one that came back broken — the wording the Search screen's
 * "Popular right now" tiles need so a dead Cloudinary asset reads as an error, not a gap.
 *
 * Extracted from app/(tabs)/index.tsx so the home feed and the search grid share one
 * image-failure behaviour.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Colors } from '../constants/Colors';

export function RemoteImage({
  uri,
  style,
  icon,
  iconSize,
  showCaption = false,
}: {
  uri?: string;
  style: StyleProp<ImageStyle>;
  icon: keyof typeof Ionicons.glyphMap;
  iconSize: number;
  /**
   * Spell out the failure under the icon. For surfaces where a bare icon is ambiguous
   * (a standalone tile), not for cards that already have their own visible context.
   */
  showCaption?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // A recycled card (FlatList) can be handed a new URL while `failed` is stuck on from
  // the previous one — reset whenever the source changes.
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    return (
      <View style={[style, styles.placeholder, showCaption && styles.placeholderCaption]}>
        <Ionicons name={icon} size={iconSize} color={Colors.foodTextMuted} />
        {showCaption && (
          <Text style={styles.captionText} numberOfLines={2}>
            {failed ? 'Unable to load image' : 'Image'}
          </Text>
        )}
      </View>
    );
  }

  return <Image source={{ uri }} style={style} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.foodBgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCaption: {
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    borderStyle: 'dashed',
    backgroundColor: Colors.foodSearchBg,
    padding: 6,
    gap: 4,
  },
  captionText: {
    fontSize: 10,
    color: Colors.foodTextMuted,
    textAlign: 'center',
  },
});

export default RemoteImage;
