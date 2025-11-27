import { Audio } from "expo-av";
import { useState } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";

export default function Live() {
  const [recording, setRecording] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ⚠️ Update this to your local IP
  const TRANSCRIBE_URL = "https://build-a-bridge2.vercel.app/api/transcribe";


  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );

      setRecording(recording);
      setTranscript("Listening...");
    } catch (err) {
      console.error("Recording start error:", err);
      setTranscript("Could not start recording");
    }
  }

  async function stopRecording() {
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      setIsUploading(true);
      setTranscript("Transcribing…");

      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "audio.m4a",
        type: "audio/m4a",
      });

      const res = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      const data = await res.json();
      setTranscript(data.text || "(empty)");
    } catch (err) {
      console.error("Stop recording error:", err);
      setTranscript("Transcription failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, textAlign: "center", marginBottom: 20 }}>
        Live Announcements
      </Text>

      <Text style={{ fontSize: 18, textAlign: "center", marginBottom: 20 }}>
        {transcript || "Tap to start recording"}
      </Text>

      {isUploading && <ActivityIndicator size="large" />}

      <Button
        title={recording ? "Stop Recording" : "Start Recording"}
        onPress={recording ? stopRecording : startRecording}
      />
    </View>
  );
}
