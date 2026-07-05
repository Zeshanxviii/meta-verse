import SimplePeer, { type SignalData } from "simple-peer";
import { getSocket } from "./socket.js";
import { getStoredUser } from "./auth.js";

type PeerMap = Map<string, SimplePeer.Instance>;
type AudioMap = Map<string, HTMLAudioElement>;
type Callback = (enabled: boolean) => void;

class VoiceChatManager {
  private peers: PeerMap = new Map();
  private audioElements: AudioMap = new Map();
  private localStream: MediaStream | null = null;
  private enabled = false;
  private listeners = new Set<Callback>();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const socket = getSocket();
    const myId = getStoredUser()?.id;

    socket.on("signal", (data: { from: string; signal: SignalData }) => {
      if (data.from === myId) return;

      let peer = this.peers.get(data.from);
      if (!peer) {
        if (!this.localStream) return;
        peer = new SimplePeer({ initiator: false, stream: this.localStream, trickle: false });
        this.setupPeer(peer, data.from);
        this.peers.set(data.from, peer);
      }

      peer.signal(data.signal);
    });
  }

  private setupPeer(peer: SimplePeer.Instance, peerId: string) {
    const socket = getSocket();

    peer.on("signal", (signal: SignalData) => {
      socket.emit("signal", { to: peerId, signal });
    });

    peer.on("stream", (stream: MediaStream) => {
      const audio = document.createElement("audio");
      audio.srcObject = stream;
      audio.autoplay = true;
      (audio as unknown as Record<string, unknown>).playsInline = true;
      audio.style.display = "none";
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
    if (!this.localStream || this.peers.has(peerId) || peerId === getStoredUser()?.id) return;

    const peer = new SimplePeer({ initiator: true, stream: this.localStream, trickle: false });
    this.setupPeer(peer, peerId);
    this.peers.set(peerId, peer);
  }

  async toggle(peerIds: string[] = []): Promise<boolean> {
    if (this.enabled) {
      this.disable();
    } else {
      await this.enable(peerIds);
    }
    return this.enabled;
  }

  private async enable(peerIds: string[]) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.enabled = true;
      for (const id of peerIds) {
        this.connectTo(id);
      }
      this.notify();
    } catch {
      this.localStream = null;
      this.enabled = false;
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
    this.enabled = false;
    this.notify();
  }

  isEnabled() {
    return this.enabled;
  }

  onToggle(cb: Callback) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.enabled));
  }

  destroy() {
    this.disable();
    this.listeners.clear();
    this.initialized = false;
  }
}

export const voiceChat = new VoiceChatManager();
