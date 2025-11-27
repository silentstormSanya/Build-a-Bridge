const fs = require("fs");
const multer = require("multer");
const util = require("util");

export const config = {
  api: {
    bodyParser: false,
  },
};

// Fix for Vercel: /tmp/ must end with slash
const upload = multer({ dest: "/tmp/" });
const uploadMiddleware = upload.single("audio");

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
  if (!ASSEMBLYAI_API_KEY) {
    return res.status(500).json({ error: "Missing AssemblyAI API key" });
  }

  try {
    // Run multer to parse FormData
    await runMiddleware(req, res, uploadMiddleware);

    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded" });
    }

    const filePath = req.file.path;

    // ---- 1. Upload to AssemblyAI ----
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { authorization: ASSEMBLYAI_API_KEY },
      body: fs.createReadStream(filePath),
    });

    const uploadData = await uploadRes.json();
    const audioUrl = uploadData.upload_url;

    if (!audioUrl) {
      return res.status(500).json({ error: "Upload to AssemblyAI failed" });
    }

    // ---- 2. Request transcription ----
    const trRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    const trData = await trRes.json();
    const trId = trData.id;

    // ---- 3. Poll for completion ----
    let finalText = "";
    let status = trData.status;

    for (let i = 0; i < 15 && status !== "completed" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const check = await fetch(`https://api.assemblyai.com/v2/transcript/${trId}`, {
        headers: { authorization: ASSEMBLYAI_API_KEY },
      });

      const cd = await check.json();
      status = cd.status;
      finalText = cd.text || "";
    }

    // Cleanup
    try { fs.unlinkSync(filePath); } catch (e) {}

    if (status === "failed") {
      return res.status(500).json({ error: "AssemblyAI failed to transcribe." });
    }

    if (status !== "completed") {
      return res.status(504).json({ error: "Transcription timed out." });
    }

    // ---- 4. SUCCESS ----
    return res.status(200).json({ text: finalText });

  } catch (err) {
    console.error("Transcription API error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
