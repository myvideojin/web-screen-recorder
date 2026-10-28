import React, { useState, useRef, useEffect } from 'react';
import ToolFAQ from './components/ToolFAQ';

import BrandedNav from './components/BrandedNav';
import BrandedFooter from './components/BrandedFooter';
import { 
  Monitor, Mic, MicOff, AlertCircle, Loader2, CheckCircle2, Square, Play, Video,
  Settings, AlertTriangle, Settings2
} from 'lucide-react';

import { useToolUsage } from './hooks/useToolUsage';

export default function ScreenRecorder() {
  const { checkUsage, incrementUsage } = useToolUsage();

  const faqs = [
    {
      "question": "Does this require installing any software?",
      "answer": "No! It uses your browser's native capabilities to capture your screen directly, making it 100% safe and installation-free."
    },
    {
      "question": "Can I record my microphone too?",
      "answer": "Yes, just toggle the microphone switch before you start recording, and your voice will be perfectly synced with the screen capture."
    },
    {
      "question": "What format does it export as?",
      "answer": "We use an advanced engine to automatically convert your recording into a highly compatible .mp4 file right before you download it."
    },
    {
      "question": "Is my recording uploaded anywhere?",
      "answer": "No, everything runs completely locally in your browser. Your recordings are safe and private."
    },
    {
      "question": "Is there a time limit for recordings?",
      "answer": "While there's no hard limit, we recommend keeping recordings under 30 minutes to ensure your browser has enough memory to process the MP4 conversion."
    }
  ];

  const [isRecording, setIsRecording] = useState(false);
  const [includeMic, setIncludeMic] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('Booting Converter...');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  const videoPreviewRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const ffmpegRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const loadStarted = useRef(false);

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;

    const loadFFmpeg = async () => {
      try {
        setLoadingMsg("Fetching Engine...");
        const { createFFmpeg } = window.FFmpeg;
        const ffmpeg = createFFmpeg({
           log: true,
           corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        
        ffmpegRef.current = ffmpeg;
        await ffmpeg.load();
        setIsReady(true);
        setLoadingMsg('Engine Loaded');
      } catch (err) {
        console.error("FFmpeg load error:", err);
        setError("Error initializing conversion engine.");
      }
    };
    
    setTimeout(() => {
        if (window.FFmpeg) {
            loadFFmpeg();
        }
    }, 500);
    
    return () => {
        stopMediaTracks();
    };
  }, []);

  const stopMediaTracks = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
      }
  };

  const handleStartRecording = async () => {
      setError(null);
      setResult(null);
      chunksRef.current = [];

      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
              video: { cursor: "always" },
              audio: true
          });

          let micStream = null;
          if (includeMic) {
              try {
                  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              } catch (micErr) {
                  console.warn("Could not get microphone", micErr);
              }
          }

          const tracks = [...screenStream.getVideoTracks()];
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const audioDestination = audioContext.createMediaStreamDestination();
          
          let hasAudio = false;

          if (screenStream.getAudioTracks().length > 0) {
              const screenAudioSource = audioContext.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks()));
              screenAudioSource.connect(audioDestination);
              hasAudio = true;
          }
          
          if (micStream && micStream.getAudioTracks().length > 0) {
              const micAudioSource = audioContext.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
              micAudioSource.connect(audioDestination);
              hasAudio = true;
          }

          if (hasAudio) {
              tracks.push(...audioDestination.stream.getAudioTracks());
          }

          const combinedStream = new MediaStream(tracks);
          streamRef.current = combinedStream;

          if (videoPreviewRef.current) {
              videoPreviewRef.current.srcObject = combinedStream;
              videoPreviewRef.current.muted = true;
              videoPreviewRef.current.play();
          }

          screenStream.getVideoTracks()[0].onended = () => {
              handleStopRecording();
          };

          const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                  chunksRef.current.push(e.data);
              }
          };

          mediaRecorder.onstop = () => {
              processRecording();
          };

          mediaRecorder.start(1000);
          setIsRecording(true);

      } catch (err) {
          console.error(err);
          setError("Failed to start recording. Did you grant permissions?");
          stopMediaTracks();
      }
  };

  const handleStopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      stopMediaTracks();
  };

  const processRecording = async () => {
    if (!checkUsage()) {
      setError("Daily limit reached. Free users can process tools 3 times a day. Please upgrade for unlimited access.");
      return;
    }
    incrementUsage();
      if (!isReady || !ffmpegRef.current) {
          setError("Converter engine is not ready. Try again.");
          return;
      }

      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setLoadingMsg("Converting to MP4...");

      try {
          const webmBlob = new Blob(chunksRef.current, { type: 'video/webm' });
          const ffmpeg = ffmpegRef.current;
          const { fetchFile } = window.FFmpeg;
          
          ffmpeg.FS('writeFile', 'input.webm', await fetchFile(webmBlob));

          let interval = setInterval(() => {
             setProgress(p => (p < 90 ? p + 2 : p));
          }, 1000);
          
          await ffmpeg.run(
            '-i', 'input.webm',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'aac',
            'output.mp4'
          );

          clearInterval(interval);
          setProgress(100);
          setLoadingMsg("Finalizing download...");

          const data = ffmpeg.FS('readFile', 'output.mp4');
          const url = window.URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
          
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `Screen_Recording_${new Date().getTime()}.mp4`);
          document.body.appendChild(link);
          link.click();
          link.parentNode.removeChild(link);
          
          const sizeMB = (data.buffer.byteLength / (1024 * 1024)).toFixed(2);
          setResult({ message: `Success! Recording saved as MP4 (${sizeMB}MB)` });

          ffmpeg.FS('unlink', 'input.webm');
          ffmpeg.FS('unlink', 'output.mp4');
      } catch (err) {
          console.error(err);
          setError("Failed to convert recording to MP4.");
      } finally {
          setIsProcessing(false);
          setProgress(0);
      }
  };

  const resetTool = () => {
      setResult(null);
      setError(null);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12">
      
      
      <BrandedNav />
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
              <Monitor className="text-rose-500" /> Screen Recorder
            </h1>
            <p className="text-gray-400 font-medium">Record your screen and export straight to MP4.</p>
          </div>
          {(isRecording || result) && (
            <button 
              onClick={result ? resetTool : null}
              disabled={isRecording}
              className={`px-6 py-2 rounded-full font-bold text-sm transition-colors border ${isRecording ? 'bg-white/5 border-white/5 text-gray-500 cursor-not-allowed' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'}`}
            >
              Reset Recorder
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Preview Area */}
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full bg-black rounded-3xl border border-white/10 shadow-2xl overflow-hidden shrink-0 aspect-video relative flex items-center justify-center">
                <video 
                  ref={videoPreviewRef} 
                  className="w-full h-full object-contain bg-zinc-900"
                />
                {!isRecording && !isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="text-center">
                            <Video className="w-12 h-12 text-slate-500 mx-auto mb-2 opacity-50" />
                            <p className="text-slate-400 font-medium tracking-wide">Preview Area</p>
                            <p className="text-slate-500 text-sm mt-2">Click "Start Recording" to begin</p>
                        </div>
                    </div>
                )}
                {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-sm font-bold text-red-500 tracking-wider">REC</span>
                    </div>
                )}
            </div>
          </div>

          {/* Sidebar Settings */}
          <div className="w-full lg:w-[350px] space-y-6">
            
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
               <div className="text-rose-200 text-xs">
                 <span className="font-bold text-rose-400">Privacy Notice:</span> 
                 Everything runs securely in your browser. Video streams are never sent to external servers.
              </div>
            </div>

            {/* Settings */}
            {!result && !isProcessing && !isRecording && (
              <div className="glass-card p-6 rounded-3xl border border-white/10 bg-white/5">
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                  <Settings2 size={16} /> Recording Options
                </h3>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => setIncludeMic(!includeMic)}
                        className={`py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all border ${
                            includeMic 
                            ? 'bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/20' 
                            : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                        }`}
                    >
                        {includeMic ? <Mic size={18} /> : <MicOff size={18} />}
                        {includeMic ? 'Microphone: ON' : 'Microphone: OFF'}
                    </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            {result && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-300 mb-2">{result.message}</p>
                <p className="text-xs text-green-400/70">Check your downloads folder for the file.</p>
              </div>
            )}

            {!result && (
              <button 
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={isProcessing || (!isReady && !isRecording)}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl transition-all flex flex-col items-center justify-center gap-2 transform relative overflow-hidden ${
                  isProcessing || (!isReady && !isRecording)
                    ? 'bg-white/10 text-white/50 cursor-not-allowed'
                    : isRecording 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20 animate-pulse'
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20 hover:-translate-y-1'
                }`}
              >
                {isProcessing && (
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                )}
                
                <div className="relative flex items-center gap-2">
                  {isProcessing || (!isReady && !isRecording) ? (
                      <Loader2 size={18} className="animate-spin" />
                  ) : isRecording ? (
                      <Square size={18} fill="currentColor" />
                  ) : (
                      <Play size={18} fill="currentColor" />
                  )}
                  {isProcessing ? loadingMsg : !isReady ? 'Booting Engine...' : isRecording ? 'Stop & Export MP4' : 'Start Recording'}
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SEO Sections */}
      <div className="mt-24 space-y-24 max-w-4xl mx-auto px-4">
        {/* How It Works */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">How to Record Your Screen</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-rose-500/20">1</div>
              <h3 className="text-xl font-bold mb-3 text-rose-400 mt-2">Setup Mic</h3>
              <p className="text-gray-400">Toggle your microphone on or off depending on if you want a voiceover.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-rose-500/20">2</div>
              <h3 className="text-xl font-bold mb-3 text-rose-400 mt-2">Start Recording</h3>
              <p className="text-gray-400">Click Start Recording and choose which screen, window, or tab to share.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-rose-500/20">3</div>
              <h3 className="text-xl font-bold mb-3 text-rose-400 mt-2">Stop</h3>
              <p className="text-gray-400">When you are finished, hit the Stop button. Our engine will immediately begin processing.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-rose-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-rose-500/20">4</div>
              <h3 className="text-xl font-bold mb-3 text-rose-400 mt-2">Export MP4</h3>
              <p className="text-gray-400">Your video is automatically converted to MP4 format and downloaded to your device.</p>
            </div>
          </div>
        </section>

        {/* Feature Breakdown */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Why Use Our Screen Recorder?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Zero Installation</h3>
              <p className="text-gray-400">No need to download heavy screen recording software. Record everything directly in your browser.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Privacy First</h3>
              <p className="text-gray-400">Your recordings never leave your device. All capturing and conversion happens locally.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Automatic MP4 Conversion</h3>
              <p className="text-gray-400">Avoid incompatible .webm files. Our engine seamlessly encodes your recording to an MP4 video upon completion.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Microphone Support</h3>
              <p className="text-gray-400">Easily record system audio and your own voice simultaneously for perfect tutorial recordings.</p>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Built for Content Creators & Professionals</h2>
          <div className="space-y-6">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Educators</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Quickly record online lessons, presentations, or step-by-step guides to share with students.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Developers</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Capture bug reports and feature demonstrations easily to share with your team or open source projects.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">YouTubers</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Record gameplay or reaction videos on the fly and immediately drop the MP4 into your favorite video editor.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ToolFAQ faqs={faqs} />
      <BrandedFooter />
    </div>
  );
}
