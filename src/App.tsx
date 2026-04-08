import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, MicOff, Send, Volume2, VolumeX, 
  Settings, Shield, Cpu, Activity, 
  Search, Mail, Music, Power, 
  Terminal, LayoutDashboard, MessageSquare,
  ChevronRight, AlertCircle, CheckCircle2,
  Globe, Play, Pause, SkipForward, SkipBack,
  Maximize2, ExternalLink, RefreshCw, ArrowLeft, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { getJarvisResponse } from "./services/geminiService";
import ReactMarkdown from "react-markdown";
import axios from "axios";

// --- Types ---
interface Message {
  role: "user" | "model" | "system";
  content: string;
  timestamp: Date;
  toolCalls?: any[];
}

interface SystemStat {
  label: string;
  value: string | number;
  unit?: string;
  status: "normal" | "warning" | "critical";
}

interface BrowserState {
  url: string;
  history: string[];
  tabs: string[];
  activeTab: number;
}

interface MediaState {
  track: string;
  artist: string;
  isPlaying: boolean;
  volume: number;
  progress: number;
}

// --- Components ---

const StatCard = ({ stat }: { stat: SystemStat }) => (
  <div className="bg-cyan-950/20 border border-cyan-500/30 p-3 rounded-lg backdrop-blur-sm">
    <div className="text-[10px] uppercase tracking-widest text-cyan-500/60 mb-1">{stat.label}</div>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-mono font-bold text-cyan-400">{stat.value}</span>
      {stat.unit && <span className="text-[10px] text-cyan-500/40">{stat.unit}</span>}
    </div>
    <div className={cn(
      "h-1 w-full mt-2 rounded-full overflow-hidden bg-cyan-900/30",
      stat.status === "warning" && "bg-yellow-900/30",
      stat.status === "critical" && "bg-red-900/30"
    )}>
      <motion.div 
        className={cn(
          "h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]",
          stat.status === "warning" && "bg-yellow-500",
          stat.status === "critical" && "bg-red-500"
        )}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(Number(stat.value) || 50, 100)}%` }}
      />
    </div>
  </div>
);

const VoiceVisualizer = ({ isActive }: { isActive: boolean }) => (
  <div className="relative w-48 h-48 flex items-center justify-center">
    {/* Outer Rings */}
    {[1, 2, 3].map((i) => (
      <motion.div
        key={i}
        className="absolute border border-cyan-500/20 rounded-full"
        style={{ width: `${i * 33}%`, height: `${i * 33}%` }}
        animate={isActive ? {
          scale: [1, 1.05, 1],
          rotate: i % 2 === 0 ? 360 : -360,
          borderColor: ["rgba(6,182,212,0.2)", "rgba(6,182,212,0.5)", "rgba(6,182,212,0.2)"]
        } : {}}
        transition={{ duration: 4 + i, repeat: Infinity, ease: "linear" }}
      />
    ))}
    
    {/* Core */}
    <motion.div 
      className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-500",
        isActive ? "bg-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.8)]" : "bg-cyan-950 border border-cyan-500/50"
      )}
      animate={isActive ? {
        scale: [1, 1.2, 1],
      } : {}}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {isActive ? <Mic className="text-black w-8 h-8" /> : <MicOff className="text-cyan-500/50 w-8 h-8" />}
    </motion.div>

    {/* Orbiting Particles */}
    {isActive && [1, 2, 3, 4].map((i) => (
      <motion.div
        key={`p-${i}`}
        className="absolute w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_5px_cyan]"
        animate={{
          rotate: 360,
          x: Math.cos(i * Math.PI / 2) * 80,
          y: Math.sin(i * Math.PI / 2) * 80,
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
    ))}
  </div>
);

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", content: "System online. JARVIS at your service. How can I assist you today, Sir?", timestamp: new Date() }
  ]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceGender, setVoiceGender] = useState<"male" | "female">("female");
  const [voiceLanguage, setVoiceLanguage] = useState<"en" | "hi">("en");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStat[]>([
    { label: "CPU Load", value: 12, unit: "%", status: "normal" },
    { label: "Memory", value: 4.2, unit: "GB", status: "normal" },
    { label: "Network", value: 120, unit: "Mb/s", status: "normal" },
    { label: "Core Temp", value: 42, unit: "°C", status: "normal" },
  ]);

  const [browser, setBrowser] = useState<BrowserState>({
    url: "https://www.google.com",
    history: ["https://www.google.com"],
    tabs: ["Google"],
    activeTab: 0
  });

  const [media, setMedia] = useState<MediaState>({
    track: "Neural Symphony",
    artist: "JARVIS Core",
    isPlaying: false,
    volume: 80,
    progress: 35
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Speech Logic (Whisper) ---
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const recognitionRef = useRef<any>(null);

  const toggleRecording = () => {
    if (isLiveMode) {
      setIsLiveMode(false);
      stopRecording();
    } else {
      setIsLiveMode(true);
      startRecording();
    }
  };

  const startRecording = async () => {
    if (isListening) return;
    
    // Check for Web Speech API support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      try {
        window.speechSynthesis.cancel();
        setIsListening(true);
        
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = voiceLanguage === "hi" ? "hi-IN" : "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          console.log("Speech recognized:", text);
          
          const lowerText = text.toLowerCase();
          if (lowerText.includes("stop") || lowerText.includes("shut up") || lowerText.includes("cancel")) {
            if (window.speechSynthesis.speaking) {
              window.speechSynthesis.cancel();
              setMessages(prev => [...prev, { role: "system", content: "Speech Interrupted by User.", timestamp: new Date() }]);
              if (isLiveMode) setTimeout(startRecording, 100);
              return;
            }
          }
          
          handleSend(text);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech Recognition Error:", event.error);
          if (isLiveMode && event.error !== "not-allowed") {
            setTimeout(startRecording, 1000);
          } else {
            setIsListening(false);
            setIsLiveMode(false);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          if (isLiveMode && !window.speechSynthesis.speaking) {
            setTimeout(startRecording, 100);
          }
        };

        recognition.start();
      } catch (err) {
        console.error("Recognition start error:", err);
        // Fallback to old method if needed, but for now just log
      }
      return;
    }

    // Fallback to MediaRecorder + Groq if SpeechRecognition is not available
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Analyser for silence detection
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let silenceStart = Date.now();
      const SILENCE_THRESHOLD = 8; // More sensitive
      const SILENCE_DURATION = 1000; // Faster response (1 second)

      const checkSilence = () => {
        if (!isListening) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;

        if (average < SILENCE_THRESHOLD) {
          if (Date.now() - silenceStart > SILENCE_DURATION) {
            stopRecording();
            return;
          }
        } else {
          silenceStart = Date.now();
        }
        requestAnimationFrame(checkSilence);
      };

      // Find supported mime type
      const mimeType = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"].find(
        type => MediaRecorder.isTypeSupported(type)
      ) || "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Cleanup audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          if (isLiveMode) startRecording(); 
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 500) { 
          if (isLiveMode) startRecording();
          return;
        }

        const formData = new FormData();
        formData.append("audio", audioBlob);

        try {
          const response = await axios.post("/api/stt", formData);
          if (response.data.text && response.data.text.trim().length > 0) {
            const text = response.data.text.trim().toLowerCase();
            
            // Barge-in check: if user says "stop" or "jarvis stop"
            if (text.includes("stop") || text.includes("shut up") || text.includes("cancel")) {
              if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                setMessages(prev => [...prev, { role: "system", content: "Speech Interrupted by User.", timestamp: new Date() }]);
                if (isLiveMode) startRecording();
                return;
              }
            }

            await handleSend(response.data.text);
          } else if (isLiveMode) {
            startRecording(); 
          }
        } catch (error: any) {
          console.error("STT Error:", error.response?.data || error.message);
          if (isLiveMode) startRecording();
        } finally {
          setIsListening(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      requestAnimationFrame(checkSilence);
    } catch (error) {
      console.error("Mic Error:", error);
      setIsLiveMode(false);
      setMessages(prev => [...prev, { role: "system", content: "Microphone access denied or unavailable.", timestamp: new Date() }]);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const speak = (text: string) => {
    if (isMuted) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Find appropriate voice
    const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
    
    // Filter by language
    const langCode = voiceLanguage === "hi" ? "hi-IN" : "en-US";
    let filteredVoices = voices.filter(v => v.lang.startsWith(langCode) || v.lang.replace("_", "-").startsWith(langCode));
    
    if (filteredVoices.length === 0) {
      // Fallback to any voice if specific language not found
      filteredVoices = voices;
    }

    // Attempt to find gender (this is tricky as it's not always in the name)
    const maleKeywords = ["male", "david", "mark", "google uk english male", "microsoft david", "ravi", "prakash"];
    const femaleKeywords = ["female", "zira", "google us english", "microsoft hazel", "google hindi", "kalpana", "hema"];

    let selectedVoice = filteredVoices.find(v => {
      const name = v.name.toLowerCase();
      if (voiceGender === "male") {
        return maleKeywords.some(k => name.includes(k));
      } else {
        return femaleKeywords.some(k => name.includes(k));
      }
    });

    if (!selectedVoice) {
      selectedVoice = filteredVoices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.lang = langCode;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      // No need to start here if we start at the beginning
    };

    window.speechSynthesis.speak(utterance);
    
    // Start listening immediately while speaking for barge-in support
    if (isLiveMode) {
      startRecording();
    }
  };

  // --- Chat Logic ---
  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);

    try {
      const history = messages
        .filter(m => m.role === "user" || m.role === "model")
        .map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));

      const result = await getJarvisResponse(text, history);
      
      let toolExecuted = false;
      // Handle Tool Calls
      if (result.functionCalls) {
        toolExecuted = true;
        for (const call of result.functionCalls) {
          console.log("Executing tool:", call.name, call.args);
          
          // Call Backend for System/Browser Commands
          try {
            const toolResponse = await axios.post("/api/system/command", {
              command: call.name === "browser_control" ? call.args.action : call.name,
              args: call.args
            });

            // Update UI State based on tool response
            if (call.name === "browser_control") {
              const args = call.args as { action: string; url?: string };
              const targetUrl = toolResponse.data.data.url || args.url;
              
              if (args.action === "open_tab") {
                window.open(targetUrl, "_blank");
              }

              if (args.action === "navigate" || args.action === "open_tab") {
                setBrowser(prev => ({
                  ...prev,
                  url: targetUrl || prev.url,
                  history: [...prev.history, targetUrl || prev.url]
                }));
              }
            } else if (call.name === "play_music") {
              const args = call.args as { query?: string; action?: string };
              const musicUrl = toolResponse.data.data.url;
              
              if (args.action !== "pause" && musicUrl) {
                window.open(musicUrl, "_blank");
              }

              setMedia(prev => ({
                ...prev,
                track: args.query || prev.track,
                isPlaying: args.action !== "pause"
              }));
            }

            const toolMsg: Message = { 
              role: "system", 
              content: `Protocol Executed: ${toolResponse.data.message}`,
              timestamp: new Date() 
            };
            setMessages(prev => [...prev, toolMsg]);
          } catch (err) {
            console.error("Tool Execution Error:", err);
          }
        }
      }

      let responseText = result.text;
      if (!responseText && toolExecuted) {
        responseText = "Protocol initiated, Sir.";
      }

      const modelMsg: Message = { role: "model", content: responseText || "I'm sorry, I couldn't process that.", timestamp: new Date() };
      setMessages(prev => [...prev, modelMsg]);
      speak(modelMsg.content);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: "system", content: "Error connecting to neural network.", timestamp: new Date() }]);
      if (isLiveMode) startRecording();
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSystemStats(prev => prev.map(stat => ({
        ...stat,
        value: typeof stat.value === "number" 
          ? Number((stat.value + (Math.random() * 4 - 2)).toFixed(1))
          : stat.value
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-cyan-50 font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      {/* Background Grid & Glow */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#083344_1px,transparent_1px),linear-gradient(to_bottom,#083344_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-cyan-500/20 bg-black/40 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Shield className="text-cyan-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
              JARVIS <span className="text-[10px] bg-cyan-500 text-black px-1.5 py-0.5 rounded font-black">V4.2</span>
            </h1>
            <div className="text-[10px] text-cyan-500/60 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Neural Link Established
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-[11px] font-mono text-cyan-500/60">
            <div className="flex items-center gap-1"><Activity className="w-3 h-3" /> Uptime: 142:12:04</div>
            <div className="flex items-center gap-1"><Cpu className="w-3 h-3" /> Latency: 24ms</div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 hover:bg-cyan-500/10 rounded-lg transition-colors border border-transparent hover:border-cyan-500/30"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button className="p-2 hover:bg-cyan-500/10 rounded-lg transition-colors border border-transparent hover:border-cyan-500/30">
              <Settings className="w-5 h-5" />
            </button>
            <button className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30">
              <Power className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex overflow-hidden">
        {/* Left Sidebar - System Status & Browser */}
        <aside className="w-80 border-r border-cyan-500/10 bg-black/20 backdrop-blur-sm p-6 hidden lg:flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">System Core</h2>
              <LayoutDashboard className="w-4 h-4 text-cyan-500/50" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {systemStats.map((stat, i) => (
                <StatCard key={i} stat={stat} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Browser Console</h2>
              <Globe className="w-4 h-4 text-cyan-500/50" />
            </div>
            <div className="bg-cyan-950/20 border border-cyan-500/30 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded border border-cyan-500/10">
                <ArrowLeft className="w-3 h-3 text-cyan-500/60" />
                <ArrowRight className="w-3 h-3 text-cyan-500/60" />
                <RefreshCw className="w-3 h-3 text-cyan-500/60" />
                <div className="flex-1 bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono truncate text-cyan-400">
                  {browser.url}
                </div>
                <ExternalLink className="w-3 h-3 text-cyan-500/60" />
              </div>
              <div className="h-32 bg-black/60 rounded border border-cyan-500/10 flex items-center justify-center relative group overflow-hidden">
                <div className="text-[10px] text-cyan-500/40 font-mono text-center px-4">
                  BROWSER_VIEWPORT_ACTIVE<br/>
                  RENDERING_ENGINE: WEBKIT_V2
                </div>
                <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="w-6 h-6 text-cyan-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Active Modules</h2>
            <div className="space-y-2">
              {[
                { icon: Search, label: "Web Intelligence", status: "Active" },
                { icon: Globe, label: "Browser Engine", status: "Active" },
                { icon: Music, label: "Media Controller", status: "Active" },
                { icon: Terminal, label: "System Shell", status: "Restricted" },
              ].map((module, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded border border-cyan-500/10 bg-cyan-950/10 text-[11px]">
                  <div className="flex items-center gap-2">
                    <module.icon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{module.label}</span>
                  </div>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold uppercase",
                    module.status === "Active" ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-white/30"
                  )}>{module.status}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center - Interaction Area */}
        <section className="flex-1 flex flex-col relative">
          {/* Voice Visualizer Overlay */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
            <VoiceVisualizer isActive={isListening || isProcessing} />
          </div>

          {/* Chat Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-cyan-500/20"
          >
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex flex-col max-w-[80%] gap-1",
                    msg.role === "user" ? "ml-auto items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "text-[10px] uppercase tracking-widest mb-1",
                    msg.role === "user" ? "text-cyan-500/60" : "text-cyan-400"
                  )}>
                    {msg.role === "user" ? "Authorized User" : msg.role === "model" ? "JARVIS" : "System Notification"}
                  </div>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                    msg.role === "user" 
                      ? "bg-cyan-600 text-white rounded-tr-none shadow-[0_0_20px_rgba(8,145,178,0.3)]" 
                      : msg.role === "model"
                        ? "bg-cyan-950/40 border border-cyan-500/20 backdrop-blur-md rounded-tl-none"
                        : "bg-white/5 border border-white/10 text-white/60 italic text-xs font-mono"
                  )}>
                    <div className="markdown-body prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="text-[9px] text-white/20 mt-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {isProcessing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-cyan-500/60 text-[10px] font-mono"
              >
                <div className="flex gap-1">
                  <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }}>.</motion.span>
                  <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}>.</motion.span>
                  <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}>.</motion.span>
                </div>
                Processing Neural Request
              </motion.div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-6 bg-gradient-to-t from-black/80 to-transparent">
            <div className="max-w-4xl mx-auto relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500" />
              <div className="relative flex items-center gap-2 bg-[#0a192f] border border-cyan-500/30 rounded-xl p-2 shadow-2xl">
                <button 
                  onClick={toggleRecording}
                  className={cn(
                    "p-3 rounded-lg transition-all duration-300",
                    isLiveMode ? "bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                  )}
                  title={isLiveMode ? "Stop Live Mode" : "Start Live Conversational Mode"}
                >
                  {isLiveMode ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
                  placeholder="Enter voice command or type here..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm placeholder:text-cyan-500/30 py-3"
                />

                <button 
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isProcessing}
                  className="p-3 bg-cyan-500 text-black rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-4 text-[10px] uppercase tracking-widest text-cyan-500/40 font-bold">
              <span className={cn("flex items-center gap-1", isLiveMode && "text-cyan-400")}><CheckCircle2 className="w-3 h-3" /> {isLiveMode ? "Live Mode Active" : "Manual Mode"}</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Neural Link Active</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Barge-in Enabled</span>
            </div>
          </div>
        </section>

        {/* Right Sidebar - Quick Actions / Media */}
        <aside className="w-80 border-l border-cyan-500/10 bg-black/20 backdrop-blur-sm p-6 hidden xl:flex flex-col gap-8">
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Quick Protocols</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Search, label: "Search", color: "cyan" },
                { icon: Mail, label: "Email", color: "blue" },
                { icon: Music, label: "Media", color: "purple" },
                { icon: MessageSquare, label: "Logs", color: "emerald" },
              ].map((action, i) => (
                <button 
                  key={i}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-cyan-500/10 bg-cyan-950/10 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-all group"
                >
                  <action.icon className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Voice Protocols</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500/60">Language</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setVoiceLanguage("en")}
                    className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold transition-all",
                      voiceLanguage === "en" ? "bg-cyan-500 text-black" : "bg-cyan-950 text-cyan-500/40"
                    )}
                  >
                    ENG
                  </button>
                  <button 
                    onClick={() => setVoiceLanguage("hi")}
                    className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold transition-all",
                      voiceLanguage === "hi" ? "bg-cyan-500 text-black" : "bg-cyan-950 text-cyan-500/40"
                    )}
                  >
                    HIN
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500/60">Gender</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setVoiceGender("male")}
                    className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold transition-all",
                      voiceGender === "male" ? "bg-cyan-500 text-black" : "bg-cyan-950 text-cyan-500/40"
                    )}
                  >
                    MALE
                  </button>
                  <button 
                    onClick={() => setVoiceGender("female")}
                    className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold transition-all",
                      voiceGender === "female" ? "bg-cyan-500 text-black" : "bg-cyan-950 text-cyan-500/40"
                    )}
                  >
                    FEMALE
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={cn(
                  "w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-all",
                  isMuted ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                )}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="text-[10px] font-bold uppercase tracking-wider">{isMuted ? "Muted" : "Audio Active"}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Neural Activity</h2>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="relative h-12 bg-cyan-950/20 rounded border border-cyan-500/10 overflow-hidden">
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 justify-between">
                    <div className="text-[9px] font-mono text-cyan-500/60">Node_{i*124}</div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((b) => (
                        <motion.div 
                          key={b}
                          className="w-1 bg-cyan-500/40 rounded-full"
                          animate={{ height: [4, 12, 4] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: Math.random() }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">Media Stream</h2>
              <Volume2 className="w-4 h-4 text-cyan-500/50" />
            </div>
            <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500/20">
                <motion.div 
                  className="h-full bg-cyan-500"
                  animate={{ width: [`${media.progress}%`] }}
                  transition={{ duration: 1 }}
                />
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 bg-cyan-500/20 rounded-lg flex items-center justify-center border border-cyan-500/30",
                    media.isPlaying && "animate-pulse"
                  )}>
                    <Music className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{media.track}</div>
                    <div className="text-[10px] text-cyan-500/60 truncate">{media.artist}</div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <SkipBack className="w-4 h-4 text-cyan-500/40 cursor-pointer hover:text-cyan-400" />
                  <button 
                    onClick={() => setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
                    className="p-2 bg-cyan-500/20 rounded-full border border-cyan-500/30 hover:bg-cyan-500/30"
                  >
                    {media.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <SkipForward className="w-4 h-4 text-cyan-500/40 cursor-pointer hover:text-cyan-400" />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer Status Bar */}
      <footer className="relative z-10 border-t border-cyan-500/10 bg-black/60 backdrop-blur-md px-6 py-2 flex items-center justify-between text-[10px] font-mono text-cyan-500/40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_5px_cyan]" />
            SYSTEM READY
          </div>
          <div className="hidden sm:block">ENCRYPTION: AES-256-GCM</div>
          <div className="hidden sm:block">LOCATION: 37.7749° N, 122.4194° W</div>
        </div>
        <div className="flex items-center gap-6">
          <div>OS: JARVIS_KERNEL_V4</div>
          <div className="flex items-center gap-2">
            <ChevronRight className="w-3 h-3" />
            {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
          </div>
        </div>
      </footer>
    </div>
  );
}
