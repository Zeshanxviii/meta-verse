import "./style.css";
import Phaser from "phaser";
import { loginWithGoogle, devLogin, getStoredToken, clearAuth, onAuthChange } from "./services/auth.js";
import { disconnectSocket } from "./services/socket.js";
import { gameConfig } from "./game/config.js";

let game: Phaser.Game | null = null;

function startGame() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = "";

  if (game) {
    game.destroy(true);
  }

  game = new Phaser.Game({ ...gameConfig, parent: app });
}

function renderAuth() {
  if (game) {
    game.destroy(true);
    game = null;
  }

  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.style.cssText = "";

  app.innerHTML = `
    <div class="app-background">
      <div class="bg-shape shape-1"></div>
      <div class="bg-shape shape-2"></div>
      <div class="bg-shape shape-3"></div>
    </div>
    <div class="auth-wrapper">
      <div class="auth-card glass-panel">
        <div class="hero-text">
          <h1 class="gradient-text">Meta-Verse</h1>
          <p class="subtitle">Enter the 2D world</p>
        </div>
        
        <div class="login-section">
          <div id="g_id_onload"
            data-client_id="${import.meta.env.VITE_GOOGLE_CLIENT_ID}"
            data-callback="handleGoogleCredential"
            data-auto_select="false"
            data-itp_support="true">
          </div>
          <div class="g_id_signin"
            data-type="standard"
            data-shape="rectangular"
            data-theme="filled_black"
            data-text="signin_with"
            data-size="large"
            data-logo_alignment="left">
          </div>
          
          <div class="divider"><span>OR</span></div>
          
          <button id="dev-login-btn" class="btn btn-dev">
            <span class="btn-icon">⚡</span>
            <span>Developer Login</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("dev-login-btn")?.addEventListener("click", async () => {
    const name = prompt("Enter your display name:", "Dev User") || "Dev User";
    try {
      await devLogin(name);
      startGame();
    } catch (err) {
      console.error("Dev login failed:", err);
      alert("Dev login failed");
    }
  });
}

(window as unknown as Record<string, unknown>).handleGoogleCredential = async (response: { credential: string }) => {
  try {
    await loginWithGoogle(response.credential);
    startGame();
  } catch (err) {
    console.error("Login failed:", err);
    alert("Login failed. Please try again.");
  }
};

onAuthChange((user) => {
  console.log("Auth state:", user ? `Logged in as ${user.displayName}` : "Logged out");
});

const token = getStoredToken();
if (token) {
  startGame();
} else {
  renderAuth();
}

export function handleLogout() {
  disconnectSocket();
  clearAuth();
  renderAuth();
}
