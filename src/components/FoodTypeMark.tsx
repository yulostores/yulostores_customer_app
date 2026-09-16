import { StyleSheet, View } from 'react-native';
import { Colors } from '../constants/Colors';
import type { MenuItem } from '../types/restaurant';

/**
 * The standard veg/non-veg mark — a small square outline with a centred dot:
 * green for veg, maroon for anything that isn't. `egg` reads as "not
 * vegetarian" here same as `non_veg`.
 *
 * Shared by the Home feed's dish cards and the Search tab's typeahead rows.
 */
export function FoodTypeMark({ foodType }: { foodType: MenuItem['foodType'] }) {
  const isVeg = foodType === 'veg';
  return (
    <View style={[styles.square, isVeg ? styles.squareVeg : styles.squareNonVeg]}>
      <View style={[styles.dot, isVeg ? styles.dotVeg : styles.dotNonVeg]} />
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareVeg: {
    borderColor: Colors.foodVegGreen,
  },
  squareNonVeg: {
    borderColor: Colors.foodNonVegRed,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotVeg: {
    backgroundColor: Colors.foodVegGreen,
  },
  dotNonVeg: {
    backgroundColor: Colors.foodNonVegRed,
  },
});

export default FoodTypeMark;
