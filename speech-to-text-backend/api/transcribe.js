// File: server.js or api/transcribe.js

import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import fetch from 'node-fetch';
import util from 'util'; // Used for Vercel/Serverless platforms

// Load environment variables (only needed for local testing)
dotenv.config(); 

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 5000;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Configure multer to store uploaded files temporarily
// You might need to adjust the path for serverless environments
const upload = multer({ dest: '/tmp/uploads/' }); 

// Promisify fs.unlink for async usage (useful for Vercel environments)
const unlinkFile = util.promisify(fs.unlink);

// --- Transcription Endpoint ---
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    if (!ASSEMBLYAI_API_KEY) {
        return res.status(500).json({ error: 'AssemblyAI API Key not configured.' });
    }

    // The temporary path where multer stored the file
    const filePath = req.file?.path; 

    if (!filePath) {
        return res.status(400).json({ error: 'No audio file received.' });
    }

    try {
        // 1. Upload the audio to AssemblyAI
        const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
            method: 'POST',
            headers: {
                authorization: ASSEMBLYAI_API_KEY,
            },
            body: fs.createReadStream(filePath),
        });

        const uploadData = await uploadRes.json();
        const audioUrl = uploadData.upload_url;
        
        if (!audioUrl) {
             console.error('AssemblyAI Upload Error:', uploadData);
             return res.status(500).json({ error: 'Failed to upload audio to AssemblyAI.' });
        }

        // 2. Request transcription
        const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: {
                authorization: ASSEMBLYAI_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ audio_url: audioUrl }),
        });
        const transcriptData = await transcriptRes.json();
        const transcriptId = transcriptData.id;

        // 3. Poll for completion (Simple Polling)
        let status = transcriptData.status;
        let finalText = '';

        // Poll for up to 30 seconds
        for (let i = 0; i < 15 && status !== 'completed' && status !== 'failed'; i++) {
            await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds

            const checkRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { authorization: ASSEMBLYAI_API_KEY },
            });
            const checkData = await checkRes.json();
            status = checkData.status;
            finalText = checkData.text || '';
        }

        // 4. Cleanup and Respond
        await unlinkFile(filePath); // Delete temp file

        if (status === 'failed') {
            return res.status(500).json({ error: 'Transcription failed by AssemblyAI.' });
        }
        if (status !== 'completed') {
             return res.status(504).json({ error: 'Transcription timed out after 30 seconds.' });
        }

        return res.json({ text: finalText });
        
    } catch (err) {
        // Attempt to clean up even if an error occurs
        if (filePath) {
             await unlinkFile(filePath).catch(cleanupErr => console.error('Cleanup failed:', cleanupErr));
        }
        console.error('Server error during transcription:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- Local Testing Startup ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export the app for serverless platforms like Vercel
export default app;