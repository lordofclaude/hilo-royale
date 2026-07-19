/* ============================================================
   Motion primitives — built-in Animated only (no Reanimated).
   Apple-feel defaults: respond on press-down, critically damped
   springs (no bounce on UI), ease-out entrances, and every
   animation degrades to a gentle cross-fade / nothing when the
   user has Reduce Motion enabled.
   ============================================================ */
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";

/* Module-level cache so late-mounting components start with the right value
   instead of flashing motion for reduce-motion users. */
let reduceMotionCache = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then(value => { reduceMotionCache = value; })
  .catch(() => {});

const ReduceMotionContext = createContext<boolean | null>(null);

export function useReduceMotion(): boolean {
  const fromContext = useContext(ReduceMotionContext);
  const [reduce, setReduce] = useState(reduceMotionCache);
  useEffect(() => {
    if (fromContext != null) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { reduceMotionCache = value; if (mounted) setReduce(value); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", value => {
      reduceMotionCache = value;
      setReduce(value);
    });
    return () => { mounted = false; sub.remove(); };
  }, [fromContext]);
  return fromContext ?? reduce;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TapProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Pressed-state scale. Keep subtle: 0.95-0.98. */
  scaleTo?: number;
  children?: React.ReactNode;
}

/** Pressable with instant press-down scale feedback (spring back on release).
 *  Feedback fires on pointer-down, never on release. The scale is subtle,
 *  direct-manipulation feedback tied to the finger, so it stays under Reduce
 *  Motion too (no autonomous movement is added). Never touches opacity, so
 *  static dim/disabled styles in `style` keep working. */
export function Tap({ style, scaleTo = 0.97, onPressIn, onPressOut, children, ...rest }: TapProps) {
  const pressed = useRef(new Animated.Value(0)).current;
  const drive = (toValue: number) => {
    Animated.spring(pressed, { toValue, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  };
  const scale = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={event => { drive(1); onPressIn?.(event); }}
      onPressOut={event => { drive(0); onPressOut?.(event); }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

interface FadeInProps {
  /** Stagger offset in ms (ignored under Reduce Motion). */
  delay?: number;
  /** Entrance slide distance; 0 for pure fade. */
  dy?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Gentle mount entrance: fade + short upward slide, strong ease-out.
 *  Content is never gated on the animation finishing; Reduce Motion gets a
 *  fast plain cross-fade with no movement. Re-key to replay. */
export function FadeIn({ delay = 0, dy = 10, duration = 320, style, children }: FadeInProps) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduce ? 160 : duration,
      delay: reduce ? 0 : delay,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
    // Mount-only entrance by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : dy, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

interface PulseProps {
  /** Pulses whenever this value changes (skips first render). */
  trigger: unknown;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** Cheap number-tick feedback: a quick scale pulse when a value updates
 *  (streak, score, points). No-op under Reduce Motion. */
export function Pulse({ trigger, style, children }: PulseProps) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.09, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 4 }),
    ]).start();
    // Pulse only when the watched value ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
