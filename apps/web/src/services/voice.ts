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

class VoiceChatManager {
  private peers: PeerMap = new Map();
  private audioElements: AudioMap = new Map();
  private localStream: MediaStream | null = null;
  private micEnabled = false;
  private speakerMuted = false;
  private listeners = new Set<Callback>();
  private initialized = false;
  private pendingSignals: Array<{ from: string; signal: SignalData }> = [];

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const socket = getSocket();
    const myId = getStoredUser()?.id;

    socket.on("signal", (data: { from: string; signal: SignalData }) => {
      if (data.from === myId) return;

      if (!this.localStream) {
        this.pendingSignals.push(data);
        return;
      }

      this.handleSignal(data);
    });
  }

  private handleSignal(data: { from: string; signal: SignalData }) {
    let peer = this.peers.get(data.from);
    if (!peer) {
      peer = new SimplePeer({ initiator: false, stream: this.localStream!, trickle: true, ...ICE_SERVERS });
      this.setupPeer(peer, data.from);
      this.peers.set(data.from, peer);
    }
    peer.signal(data.signal);
  }

  private setupPeer(peer: SimplePeer.Instance, peerId: string) {
    const socket = getSocket();

    peer.on("signal", (signal: SignalData) => {
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
    });

    peer.on("error", () => {
      this.cleanupPeer(peerId);
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

  async connectTo(peerId: string) {
    if (!this.localStream || peerId === getStoredUser()?.id) return;
    if (this.peers.has(peerId)) return;

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
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.micEnabled = true;

      for (const id of peerIds) {
        this.connectTo(id);
      }

      for (const pending of this.pendingSignals) {
        this.handleSignal(pending);
      }
      this.pendingSignals = [];

      this.notify();
    } catch {
      this.localStream = null;
      this.micEnabled = false;
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
    this.pendingSignals = [];
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

  destroy() {
    this.disable();
    this.listeners.clear();
    this.initialized = false;
    this.pendingSignals = [];
  }
}

export const voiceChat = new VoiceChatManager();
