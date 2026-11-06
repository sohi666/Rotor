import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { C, F, PIN_COLORS, PIN_RIMS, SPACE, T } from '../theme';
import { buzz, play } from '../feedback';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Txt({
  children,
  style,
  variant = 'body',
  color,
  numberOfLines,
  center,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  variant?: 'hero' | 'title' | 'heading' | 'body' | 'small' | 'tiny' | 'number';
  color?: string;
  numberOfLines?: number;
  center?: boolean;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles[variant], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}
      maxFontSizeMultiplier={1.4}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  sublabel,
  disabled,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  icon?: IconName;
  sublabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const fg = kind === 'primary' ? C.ink : C.ivory;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        play('tap', 0.5);
        buzz.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && styles.buttonPrimary,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'quiet' && styles.buttonQuiet,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={fg} style={{ marginRight: SPACE.s }} />}
      <View style={{ alignItems: icon ? 'flex-start' : 'center' }}>
        <Text style={[styles.buttonLabel, { color: fg }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.buttonSub, { color: fg }]} maxFontSizeMultiplier={1.3}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  badge,
  disabled,
  size = 26,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number | string;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge !== undefined ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => {
        play('tap', 0.5);
        buzz.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={size} color={C.ivory} />
      <Text style={styles.iconLabel} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
      {badge !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Coins({ value, onPress }: { value: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value}`} style={styles.coins} hitSlop={8}>
      <View style={styles.coinDot}>
        <View style={styles.coinInner} />
      </View>
      <Text style={styles.coinText}>{value}</Text>
    </Pressable>
  );
}

/** Three enamel pins that fill in like stars. */
export function Stars({ value, size = 22, gap = 8 }: { value: number; size?: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }} accessible accessibilityLabel={`${value}/3`}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: i < value ? PIN_COLORS[[0, 1, 2][i]] : 'transparent',
            borderWidth: 2,
            borderColor: i < value ? PIN_RIMS[[0, 1, 2][i]] : C.petrolLine,
          }}
        />
      ))}
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.sheet}>
            {children}
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: { fontFamily: F.display, fontSize: T.hero, color: C.ivory, letterSpacing: -0.5 },
  title: { fontFamily: F.display, fontSize: T.title, color: C.ivory, letterSpacing: -0.3 },
  heading: { fontFamily: F.uiBold, fontSize: T.heading, color: C.ivory },
  body: { fontFamily: F.ui, fontSize: T.body, color: C.ivory, lineHeight: 23 },
  small: { fontFamily: F.ui, fontSize: T.small, color: C.ivoryDim, lineHeight: 20 },
  tiny: { fontFamily: F.uiSemi, fontSize: T.tiny, color: C.ivoryDim },
  number: { fontFamily: F.displayMedium, fontSize: T.heading, color: C.ivory },
  button: {
    minHeight: 54,
    borderRadius: 27,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: C.brass,
    borderBottomWidth: 3,
    borderBottomColor: C.brassDeep,
  },
  buttonSecondary: { borderWidth: 2, borderColor: C.petrolLine, backgroundColor: C.petrolDeep },
  buttonQuiet: { backgroundColor: 'transparent' },
  buttonLabel: { fontFamily: F.uiBold, fontSize: 17 },
  buttonSub: { fontFamily: F.ui, fontSize: 13, opacity: 0.8, marginTop: 1 },
  iconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 64, paddingVertical: SPACE.xs },
  iconLabel: { fontFamily: F.uiSemi, fontSize: 12, color: C.ivoryDim, marginTop: 2 },
  badge: {
    position: 'absolute',
    top: -2,
    right: 10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontFamily: F.uiBold, fontSize: 11, color: C.ink },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.petrolDeep,
    borderRadius: 16,
    paddingLeft: 6,
    paddingRight: 12,
    height: 32,
  },
  coinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.brass,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  coinInner: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: C.brassDeep },
  coinText: { fontFamily: F.displayMedium, fontSize: 14, color: C.ivory },
  scrim: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.petrol,
    borderRadius: 28,
    padding: SPACE.xl,
    borderWidth: 2,
    borderColor: C.petrolLine,
  },
  toast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: C.ivory,
    borderRadius: 20,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.s,
  },
  toastText: { fontFamily: F.uiSemi, fontSize: 14, color: C.ink },
});
