import { Tabs } from 'expo-router';
import TabBar from '../../src/components/TabBar';

/**
 * The `(tabs)` group holds six screens, but the bar only ever shows the ones the
 * backend lists — today Delivery (this group's `index`), the QR scanner and
 * History. Cart, Search and Profile stay in the group because they are still
 * tab routes (`router.navigate('/(tabs)/cart')`, state preserved between
 * visits), they just aren't destinations on the bar: you reach the cart from the
 * floating cart pill, search from the home search field and profile from the
 * home avatar, and each of those screens draws its own back arrow.
 *
 * Everything the bar renders — which of these routes appear, their order,
 * labels, icons, both accent palettes and every measurement — comes from
 * `GET /api/app/config` → `tabBar`, so nothing about the bar is decided here.
 * See `src/components/TabBar.tsx` and `src/services/navigation.ts`.
 *
 * The bar floats over the page rather than sitting under it (it renders
 * absolutely and reserves no layout height), so a screen with a scroll view
 * pads its content by `useTabBarInset()` to keep its last row clear of it.
 *
 * The bar never slides away or auto-hides, with one exception: it steps aside
 * while the QR scanner's camera is open (`src/lib/cameraOpen.ts`). The phone's
 * own navigation bar is the one that fades out after a few idle seconds; that
 * lives in `useSystemNavBarAutoHide` at the app root.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
