import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Elevation } from '../constants/Theme';
import { useAuth } from '../context/AuthContext';

export default function DemoSessionBanner() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  if (!session?.bypassed) {
    return null;
  }

  return (
    <View style={[styles.container, { top: insets.top || 40 }]}>
      <Text style={styles.text}>Demo session — orders and cart are disabled</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Colors.authDanger,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.raised,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
