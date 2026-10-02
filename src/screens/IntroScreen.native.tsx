import React from "react";
import { StyleSheet, View } from "react-native";
import { useEventListener } from "expo";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";

type IntroScreenProps = {
  onFinish: () => void;
};

const IntroScreen = ({ onFinish }: IntroScreenProps) => {
  const player = useVideoPlayer(require("../../assets/luxia-intro.mp4"), (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  useEventListener(player, "playToEnd", onFinish);
  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") {
      onFinish();
    }
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
        playsInline
      />
    </View>
  );
};

export default IntroScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#071C33",
  },
  video: {
    width: "100%",
    height: "100%",
  },
});
