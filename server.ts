import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import dotenv from "dotenv";
import multer from "multer";
import FormData from "form-data";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ dest: "uploads/" });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Whisper Transcription (Groq)
  app.post("/api/stt", upload.single("audio"), async (req: any, res) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY not configured" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    try {
      const formData = new FormData();
      const extension = req.file.mimetype.split("/")[1] || "webm";
      formData.append("file", fs.createReadStream(req.file.path), {
        filename: `audio.${extension}`,
        contentType: req.file.mimetype,
      });
      formData.append("model", "whisper-large-v3");

      const response = await axios.post(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      res.json({ text: response.data.text });
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error("STT Error:", errorData || error.message);
      if (req.file) fs.unlinkSync(req.file.path);
      
      // If it's a buffer, try to convert to string
      const errorMessage = errorData instanceof Buffer ? errorData.toString() : JSON.stringify(errorData);
      res.status(500).json({ error: "Failed to transcribe audio", details: errorMessage || error.message });
    }
  });

  // Enhanced System & Browser Control API
  app.post("/api/system/command", (req, res) => {
    const { command, args } = req.body;
    console.log(`Executing system command: ${command}`, args);
    
    // In this environment, we simulate the browser and system actions
    // but we return a rich response that the UI can use to show visual feedback
    
    let message = `Command '${command}' executed.`;
    let data = {};

    switch (command) {
      case "open_tab":
      case "navigate":
        let url = args.url || "https://www.google.com";
        if (!url.startsWith("http")) {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        // Special handling for common sites
        if (url.includes("youtube.com") || url.includes("youtube")) {
          url = "https://www.youtube.com";
        }
        message = `Navigating to ${url}`;
        data = { url };
        break;
      case "extract_text":
        message = `Extracting content from current page...`;
        data = { content: "Simulated extracted text from " + args.url };
        break;
      case "play_music":
        const query = args.query || "lofi hip hop";
        const musicUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        message = `Searching and playing: ${query}`;
        data = { track: query, status: "playing", url: musicUrl };
        break;
    }

    res.json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
