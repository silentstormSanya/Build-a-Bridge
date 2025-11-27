import { Audio } from "expo-av";
import { useState } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";

export default function Live() {
  const [recording, setRecording] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ⚠️ Ensure this is your CORRECT and LIVE Vercel URL!
  // Based on your deployment, this should be:
  const TRANSCRIBE_URL = "https://build-a-bridge-backend.vercel.app/server"; 


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
    // Check if recording is active before attempting to stop
    if (!recording) return;

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

      // --- FETCH REQUEST WITH IMPROVED ERROR HANDLING ---
      const res = await fetch(TRANSCRIBE_URL, {
        method: "POST",
        // NOTE: Do not manually set 'Content-Type' for FormData, fetch handles it.
        body: formData,
      });

      // CHECK FOR NON-SUCCESS STATUS (4xx or 5xx)
      if (!res.ok) {
        // Read the raw text response for better debugging
        const errorText = await res.text();
        console.error("Server Response Error:", res.status, errorText);
        setTranscript(`Server Error (${res.status}): ${errorText.substring(0, 50)}...`);
        return; // Exit function on error
      }

      // ONLY parse as JSON if the response status is OK (200)
      const data = await res.json();
      setTranscript(data.text || "(empty)");

    } catch (err) {
      // Catch network errors, JSON parsing errors, etc.
      console.error("Stop recording error:", err);
      setTranscript("Transcription failed. (Check console for error details)");
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
        disabled={isUploading} // Disable buttons while uploading
      />
    </View>
  );
}