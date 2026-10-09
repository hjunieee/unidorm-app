import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SPLASH_BACKGROUND, SPLASH_LOGO_RATIO, SPLASH_LOGO_WIDTH } from "../theme";

/** Images that must be on screen before the system splash may be dropped. */
const ASSET_COUNT = 1;

// Never strand the user on the system splash. `onDisplay`/`onError` should
// always fire, but a decode that neither succeeds nor reports failure would
// otherwise leave the app looking hung at launch.
const HANDOFF_TIMEOUT_MS = 1500;

// Launch-once state, deliberately module-level rather than component state:
// SplashArt is mounted twice in a normal launch — first by the connectivity
// gate in `app/index.tsx`, then by the root container's reveal overlay — and
// both the hand-off and the entrance must happen exactly once across the two.
let systemSplashHidden = false;
let entrancePlayed = false;

/**
 * The branded launch screen, drawn in JS.
 *
 * UNIDorm splash renders the deep blue background (#01499A) with the centered
 * white UNIDorm emblem logo.
 */
export default function SplashArt() {
  const reduceMotion = useReducedMotion();

  // Entrance opacity animation
  const opacity = useSharedValue(entrancePlayed ? 1 : 0);

  const [drawn, setDrawn] = useState(entrancePlayed);

  const handOff = useCallback(() => {
    if (!systemSplashHidden) {
      systemSplashHidden = true;
      void SplashScreen.hideAsync();
    }
    setDrawn(true);
  }, []);

  const onAssetDrawn = useCallback(() => {
    if (systemSplashHidden) return;
    handOff();
  }, [handOff]);

  useEffect(() => {
    if (systemSplashHidden) return;
    const timeout = setTimeout(handOff, HANDOFF_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [handOff]);

  useEffect(() => {
    if (!drawn || entrancePlayed) return;
    entrancePlayed = true;
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 400 });
  }, [drawn, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.center, animatedStyle]}>
        <Image
          source={require("../../assets/splash/logo-splash.png")}
          style={{
            width: SPLASH_LOGO_WIDTH,
            height: SPLASH_LOGO_WIDTH / SPLASH_LOGO_RATIO,
          }}
          contentFit="contain"
          onDisplay={onAssetDrawn}
          onError={onAssetDrawn}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
