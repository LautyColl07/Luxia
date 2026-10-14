import React, { useEffect, useId, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, Image, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';

const ARTWORK = require('../../assets/lux waving img.png');
const CANVAS = 1254;
const WAVE_DURATION = 1440;
const REST_ANGLE = -48;
// Trace the raised arm in the original illustration; both layers use the same PNG.
const ARM = 'M194 402 C225 368 260 387 270 410 C278 433 248 468 225 498 C239 545 269 582 307 598 C330 602 341 628 333 662 C328 690 309 704 283 699 C204 693 151 642 123 586 L105 558 C67 543 54 519 53 502 C20 494 12 469 21 448 C27 433 40 426 61 430 C39 405 43 378 58 367 C79 351 99 365 116 390 C108 364 116 343 137 337 C162 330 178 351 185 374 Z';

export type LuxWavingProps = {
  size?: number;
  isActive?: boolean;
  /** Time between the start of two greetings, in milliseconds. */
  intervalMs?: number;
};

/** A layered illustration animated on the UI thread, with no GIF playback. */
export default function LuxWaving({ size = 120, isActive = true, intervalMs = 10000 }: LuxWavingProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyMask = `lux-body-${id}`;
  const armClip = `lux-arm-${id}`;
  const coverGradient = `lux-cover-${id}`;
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  // Wait for the accessibility query before starting any motion.
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useSharedValue(0);
  const period = Number.isFinite(intervalMs) ? Math.max(WAVE_DURATION, intervalMs) : 10000;

  useEffect(() => {
    let mounted = true;
    const appSubscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    }).catch(() => { /* Keep the illustration still if the setting is unavailable. */ });
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      appSubscription.remove();
      motionSubscription.remove();
    };
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (isActive && foreground && !reduceMotion) {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: WAVE_DURATION, easing: Easing.linear }),
          withTiming(0, { duration: 0 }),
          withDelay(period - WAVE_DURATION, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    }
    return () => cancelAnimation(progress);
  }, [foreground, isActive, period, progress, reduceMotion]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 0.17, 0.5, 0.75, 1], [0, -size * 0.015, -size * 0.025, -size * 0.015, 0]) },
      { rotate: `${interpolate(progress.value, [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1], [0, -2, 2, -2, 2, -1, 0])}deg` },
    ],
  }), [progress, size]);
  const armStyle = useAnimatedStyle(() => {
    const angle = interpolate(progress.value, [0, 0.17, 0.28, 0.4, 0.52, 0.64, 0.76, 1], [REST_ANGLE, 0, 12, -9, 12, -9, 6, REST_ANGLE]);
    const scale = interpolate(progress.value, [0, 0.17, 0.76, 1], [0.7, 1, 1, 0.7]);
    // Translate around the shoulder, rather than rotating around the image centre.
    const pivotX = (306 / CANVAS - 0.5) * size;
    const pivotY = (650 / CANVAS - 0.5) * size;
    return {
      transform: [
        { translateX: pivotX }, { translateY: pivotY },
        { rotate: `${angle}deg` }, { scale },
        { translateX: -pivotX }, { translateY: -pivotY },
      ],
    };
  }, [progress, size]);
  const expressionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.3, 0.65, 0.78, 1], [0, 0, 1, 1, 0, 0]),
  }), [progress]);
  const marksStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 1], [0, 0, 1, 0.3, 1, 0.3, 1, 0, 0]),
  }), [progress]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Lux, asistente de LuxIA, saludando" pointerEvents="none" style={{ width: size, height: size }}>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.layer, bodyStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
          <Defs>
            <Mask id={bodyMask} x={0} y={0} width={CANVAS} height={CANVAS} maskUnits="userSpaceOnUse">
              <Rect width={CANVAS} height={CANVAS} fill="white" />
              <Path d={ARM} fill="black" />
            </Mask>
            <LinearGradient id={coverGradient} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#020c2d" />
              <Stop offset="0.55" stopColor="#12357d" />
              <Stop offset="1" stopColor="#03133d" />
            </LinearGradient>
          </Defs>
          {/* Continue the book cover behind the arm so the shoulder never leaves a hole. */}
          <Path d="M205 330 L282 330 L282 717 L195 717 Z" fill={`url(#${coverGradient})`} />
          <Path d="M239 330 L239 717" fill="none" stroke="#4269c5" strokeWidth={5} />
          <Image href={ARTWORK} width={CANVAS} height={CANVAS} mask={`url(#${bodyMask})`} />
        </Svg>
        <Animated.View style={[styles.layer, armStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
            <Defs><ClipPath id={armClip}><Path d={ARM} /></ClipPath></Defs>
            <Image href={ARTWORK} width={CANVAS} height={CANVAS} clipPath={`url(#${armClip})`} />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.layer, expressionStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
            <Ellipse cx={467} cy={473} rx={38} ry={54} fill="#fffcea" />
            <Ellipse cx={653} cy={489} rx={34} ry={51} fill="#fffbea" />
            <Path d="M444 481 Q466 443 488 481 M632 496 Q653 461 675 496" fill="none" stroke="#031334" strokeWidth={15} strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.layer, marksStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
            <Path d="M92 298 L74 276 M143 278 L140 246 M186 289 L202 266" fill="none" stroke="#f4a000" strokeWidth={12} strokeLinecap="round" />
            <Path d="M44 365 Q15 390 30 423 M27 349 Q-5 388 9 429" fill="none" stroke="#f4a000" strokeWidth={5} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } });
