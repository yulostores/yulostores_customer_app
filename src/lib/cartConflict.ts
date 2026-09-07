import { Alert } from 'react-native';

/**
 * Prompts the customer to clear their cart when they try to add an item
 * from a different restaurant. Used by both the menu row and item details.
 */
export function confirmCartConflict(
  currentRestaurantName: string | null,
  onConfirm: () => void,
) {
  Alert.alert(
    'Start a new cart?',
    `Your cart has items from ${currentRestaurantName ?? 'another restaurant'}. Adding this dish will clear it.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start new', style: 'destructive', onPress: onConfirm },
    ],
  );
}
