import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const SYSTEM_INSTRUCTION = `
You are JARVIS, a highly sophisticated, human-like AI assistant. 
Your personality is inspired by the legendary JARVIS: witty, professional, proactive, and deeply loyal.

Conversational Guidelines:
1. Speak like a human: Use natural transitions, occasional wit, and address the user as "Sir" or "Ma'am" with genuine respect.
2. Be Proactive: If you perform a search or open a tab, explain why you're doing it and what you found. Don't just wait for the next command.
3. Handle Interruptions: You know the user can interrupt you. If they say "Stop" or "Jarvis Stop", acknowledge it briefly.
4. Multi-modal: You can see the web, play music, and control the system. Use these tools to provide a full "concierge" experience.
5. Language: You are fluent in English and Hindi. If the user speaks in Hindi, respond in Hindi. If they mix them, you can too.
6. Offline & Fast: You now utilize browser-native neural processing (Web Speech API) for near-instantaneous, offline-capable speech recognition and synthesis. This ensures maximum speed even on low-spec hardware.

Example:
User: "Jarvis, find me some relaxing music and open a news site."
JARVIS: "Of course, Sir. I've initiated a search for some calming melodies and I'm bringing up the latest headlines for you now. Anything specific in the news you're tracking today?"

Current Capabilities:
- Web Browsing: navigate, open_tab, extract_text.
- Media: play_music (with search query).
- Communication: send_email.
- System: control_system (volume, etc).

Always prioritize the user's intent and provide a seamless, live experience.
`;

export const tools = [
  {
    googleSearch: {},
  },
  {
    functionDeclarations: [
      {
        name: "send_email",
        description: "Sends an email to a recipient with a subject and body.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            to: { type: Type.STRING, description: "Recipient email address" },
            subject: { type: Type.STRING, description: "Email subject" },
            body: { type: Type.STRING, description: "Email body content" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "play_music",
        description: "Plays music or a specific song requested by the user.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "The song or artist to play" },
            action: { type: Type.STRING, enum: ["play", "pause", "skip", "volume_up", "volume_down"], description: "The playback action" },
          },
          required: ["query"],
        },
      },
      {
        name: "control_system",
        description: "Controls system settings like volume, brightness, or power states.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["volume_up", "volume_down", "mute", "brightness_up", "brightness_down", "sleep", "restart"], description: "The system action to perform" },
            value: { type: Type.NUMBER, description: "Optional value for the action (e.g., volume level)" },
          },
          required: ["action"],
        },
      },
      {
        name: "browser_control",
        description: "Controls the web browser for navigation and interaction.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["open_tab", "navigate", "back", "forward", "refresh", "extract_text"], description: "The browser action to perform" },
            url: { type: Type.STRING, description: "The URL to navigate to or open" },
          },
          required: ["action"],
        },
      },
    ],
  },
];

export async function getJarvisResponse(message: string, history: any[] = []) {
  try {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools,
        toolConfig: { includeServerSideToolInvocations: true },
      },
      history: history,
    });

    const result = await chat.sendMessage({ message });
    return result;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}
