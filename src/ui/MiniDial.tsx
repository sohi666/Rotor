import React, { useEffect } from 'react';
import { Canvas, Circle, Group, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { C, PIN_COLORS } from '../theme';

/**
 * A small two-ring dial used as the "o" in the wordmark. On mount the rings
 * spin from a scrambled position into alignment, lighting one spoke.
 */
export function MiniDial({ size, delay = 0, spin = 1 }: { size: number; delay?: number; spin?: number }) {
  const c = size / 2;
  const outer = useSharedValue(-2.2 * spin);
  const inner = useSharedValue(1.6 * spin);
  useEffect(() => {
    outer.value = withDelay(delay, withTiming(0, { duration: 1100, easing: Easing.out(Easing.back(1.4)) }));
    inner.value = withDelay(delay + 120, withTiming(0, { duration: 1000, easing: Easing.out(Easing.back(1.6)) }));
  }, [delay, inner, outer]);
  const tOuter = useDerivedValue(() => [{ rotate: outer.value }]);
  const tInner = useDerivedValue(() => [{ rotate: inner.value }]);
  const rim = size * 0.48;
  const r1 = size * 0.36;
  const r0 = size * 0.22;
  const pin = size * 0.075;
  const at = (rad: number, k: number, n: number) => {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
    return { x: c + rad * Math.cos(a), y: c + rad * Math.sin(a) };
  };
  const outerPins = [0, 2, 4].map((k, i) => ({ ...at(r1, k, 6), color: i === 0 ? PIN_COLORS[0] : PIN_COLORS[3] }));
  const innerPins = [0, 3].map((k, i) => ({ ...at(r0, k, 6), color: i === 0 ? PIN_COLORS[0] : PIN_COLORS[1] }));
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={c} cy={c} r={rim} color={C.brass} />
      <Circle cx={c} cy={c} r={rim * 0.9} color={C.ivory} />
      <Circle cx={c} cy={c} r={r1} style="stroke" strokeWidth={size * 0.14} color={C.track} />
      <Circle cx={c} cy={c} r={r0} style="stroke" strokeWidth={size * 0.12} color={C.trackAlt} />
      <Group origin={vec(c, c)} transform={tOuter}>
        {outerPins.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={pin} color={p.color} />
        ))}
      </Group>
      <Group origin={vec(c, c)} transform={tInner}>
        {innerPins.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={pin} color={p.color} />
        ))}
      </Group>
      <Circle cx={c} cy={c} r={size * 0.09} color={C.brass} />
    </Canvas>
  );
}
