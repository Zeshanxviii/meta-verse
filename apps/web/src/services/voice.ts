import SimplePeer, { type SignalData } from "simple-peer";
import { getSocket } from "./socket.js";
import { getStoredUser } from "./auth.js";

type PeerMap = Map<string, SimplePeer.Instance>;
type AudioMap = Map<string, HTMLAudioElement>;
type Callback = (enabled: boolean) => void;

const ICE_SERVERS = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;


function preferOpusBitrate(sdp: string, bitrate = 32000): string {
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000/);
  if (!opusMatch) return sdp;

  const payloadType = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${payloadType} (.*)`);

  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_match, params: string) => {
      if (params.includes("maxaveragebitrate")) return `a=fmtp:${payloadType} ${params}`;
      return `a=fmtp:${payloadType} ${params};maxaveragebitrate=${bitrate}`;
    });
  }

  return sdp.replace(
    opusMatch[0],
    `${opusMatch[0]}\r\na=fmtp:${payloadType} maxaveragebitrate=${bitrate}`
  );
}


class VoiceChatManager {
  private peers: PeerMap = new Map();
  private audioElements: AudioMap = new Map();
  private localStream: MediaStream | null = null;
  private micEnabled = false;
  private speakerMuted = false;
  private listeners = new Set<Callback>();
  private errorListeners = new Set<(err: string) => void>();
  private initialized = false;
  private signalHandler: ((data: { from: string; signal: SignalData }) => void) | null = null;
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const socket = getSocket();
    const myId = getStoredUser()?.id;

    this.signalHandler = (data: { from: string; signal: SignalData }) => {
      if (data.from === myId) return;
      this.handleSignal(data);
    };

    socket.on("signal", this.signalHandler);
  }

  private handleSignal(data: { from: string; signal: SignalData }) {
    let peer = this.peers.get(data.from);
    if (!peer) {
      this.cancelReconnect(data.from);
      this.reconnectAttempts.delete(data.from);

      peer = new SimplePeer({
        initiator: false,
        stream: this.localStream ?? undefined,
        trickle: true,
        ...ICE_SERVERS,
      });
      this.setupPeer(peer, data.from);
      this.peers.set(data.from, peer);
    }
    peer.signal(data.signal);
  }


  private setupPeer(peer: SimplePeer.Instance, peerId: string) {
    const socket = getSocket();

    peer.on("signal", (signal: SignalData) => {
      if ("sdp" in signal && signal.sdp) {
        signal = { ...signal, sdp: preferOpusBitrate(signal.sdp) };
      }
      socket.emit("signal", { to: peerId, signal });
    });

    peer.on("stream", (stream: MediaStream) => {
      const existing = this.audioElements.get(peerId);
      if (existing) {
        existing.srcObject = stream;
        return;
      }

      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      (audio as unknown as Record<string, unknown>).playsInline = true;
      audio.style.display = "none";
      audio.muted = this.speakerMuted;
      document.body.appendChild(audio);
      audio.play().catch((e) => console.warn("Voice play error:", e));
      this.audioElements.set(peerId, audio);
    });

    peer.on("close", () => {
      this.cleanupPeer(peerId);
      this.scheduleReconnect(peerId);
    });

    peer.on("error", () => {
      this.cleanupPeer(peerId);
      this.scheduleReconnect(peerId);
    });
  }

  private cleanupPeer(peerId: string) {
    this.peers.delete(peerId);
    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(peerId);
    }
  }

  private scheduleReconnect(peerId: string) {
    const attempts = (this.reconnectAttempts.get(peerId) ?? 0) + 1;
    if (attempts > MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts.set(peerId, attempts);

    const delay = RECONNECT_BASE_DELAY * attempts;
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(peerId);
      this.tryReconnect(peerId);
    }, delay);

    this.reconnectTimers.set(peerId, timer);
  }

  private tryReconnect(peerId: string) {
    if (peerId === getStoredUser()?.id) return;
    if (this.peers.has(peerId)) return;

    if (this.localStream) {
      const peer = new SimplePeer({ initiator: true, stream: this.localStream, trickle: true, ...ICE_SERVERS });
      this.setupPeer(peer, peerId);
      this.peers.set(peerId, peer);
    }
  }

  private cancelReconnect(peerId: string) {
    const timer = this.reconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(peerId);
    }
  }

  removePeer(peerId: string) {
    this.cancelReconnect(peerId);
    this.reconnectAttempts.delete(peerId);
    this.cleanupPeer(peerId);
  }

  async connectTo(peerId: string) {
    if (!this.localStream || peerId === getStoredUser()?.id) return;
    if (this.peers.has(peerId)) return;

    this.cancelReconnect(peerId);
    this.reconnectAttempts.delete(peerId);

    const peer = new SimplePeer({ initiator: true, stream: this.localStream, trickle: true, ...ICE_SERVERS });
    this.setupPeer(peer, peerId);
    this.peers.set(peerId, peer);
  }

  async toggleMic(peerIds: string[] = []): Promise<boolean> {
    if (this.micEnabled) {
      this.disable();
    } else {
      await this.enable(peerIds);
    }
    return this.micEnabled;
  }

  private async enable(peerIds: string[]) {
    try {

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
          sampleRate: 48000,
        },
        video: false,
      });
      this.micEnabled = true;

      for (const peer of this.peers.values()) {
        peer.addStream(this.localStream);
      }

      for (const id of peerIds) {
        this.connectTo(id);
      }

      this.notify();
    } catch (err) {
      this.localStream = null;
      this.micEnabled = false;
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone permission denied. Please allow mic access in your browser settings."
        : err instanceof DOMException && err.name === "NotFoundError"
          ? "No microphone found. Please connect a microphone."
          : "Failed to access microphone. Check your audio devices and permissions.";
      this.notifyError(msg);
      this.notify();
    }
  }

  private disable() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.peers.forEach((p) => p.destroy());
    this.peers.clear();
    this.audioElements.forEach((a) => { a.pause(); a.srcObject = null; a.remove(); });
    this.audioElements.clear();
    this.micEnabled = false;
    this.reconnectTimers.forEach((t) => clearTimeout(t));
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();
    this.notify();
  }

  toggleSpeaker(): boolean {
    this.speakerMuted = !this.speakerMuted;
    this.audioElements.forEach((a) => { a.muted = this.speakerMuted; });
    return !this.speakerMuted;
  }

  isSpeakerOn(): boolean {
    return !this.speakerMuted;
  }

  isMicEnabled() {
    return this.micEnabled;
  }

  onToggle(cb: Callback) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.micEnabled));
  }

  onError(cb: (err: string) => void) {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  private notifyError(msg: string) {
    this.errorListeners.forEach((cb) => cb(msg));
  }

  destroy() {
    this.disable();
    this.listeners.clear();
    this.errorListeners.clear();
    if (this.signalHandler) {
      getSocket().off("signal", this.signalHandler);
      this.signalHandler = null;
    }
    this.initialized = false;
  }
}

export const voiceChat = new VoiceChatManager();
