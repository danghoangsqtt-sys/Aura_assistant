/**
 * CameraVisionService — Electron Webcam Capture
 *
 * Singleton service that manages webcam access in the Electron renderer process.
 * Captures frames as base64 JPEG at regular intervals, designed to feed into
 * Gemini Live API via sendScreenFrame() for real-world visual awareness.
 *
 * Architecture:
 *   getUserMedia → hidden <video> → <canvas>.drawImage → toDataURL('image/jpeg')
 *
 * This runs entirely in the renderer process — no native modules needed.
 */

class CameraVisionServiceImpl {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private _isActive = false;

  /** Whether the camera is currently streaming */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Start webcam capture.
   * Creates a hidden <video> element that receives the camera stream.
   * @returns true if started successfully, false otherwise.
   */
  async start(): Promise<boolean> {
    if (this._isActive && this.stream) {
      console.log('[CameraVision] Already active.');
      return true;
    }

    try {
      // Request webcam — prefer 640x480 to balance quality vs performance
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user', // Front camera
        },
        audio: false, // We only need video
      });

      // Create hidden video element
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      // Keep it off-screen (never appended to DOM visible area)
      this.videoElement.style.position = 'fixed';
      this.videoElement.style.top = '-9999px';
      this.videoElement.style.left = '-9999px';
      this.videoElement.style.width = '1px';
      this.videoElement.style.height = '1px';
      this.videoElement.style.opacity = '0';
      this.videoElement.style.pointerEvents = 'none';
      document.body.appendChild(this.videoElement);

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) return reject(new Error('No video element'));
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play().then(resolve).catch(reject);
        };
        // Timeout safety
        setTimeout(() => resolve(), 3000);
      });

      // Create canvas for frame capture
      this.canvasElement = document.createElement('canvas');

      this._isActive = true;
      console.log('[CameraVision] Started. Stream tracks:', this.stream.getVideoTracks().length);
      return true;
    } catch (err) {
      console.error('[CameraVision] Failed to start:', err);
      this.cleanup();
      return false;
    }
  }

  /**
   * Stop webcam and release all resources.
   */
  stop(): void {
    console.log('[CameraVision] Stopping...');
    this.cleanup();
  }

  /**
   * Capture a single frame from the webcam as base64 JPEG.
   * @returns base64 JPEG string (without data URI prefix) or null if capture fails.
   */
  captureFrame(): string | null {
    if (!this._isActive || !this.videoElement || !this.canvasElement) {
      return null;
    }

    try {
      const video = this.videoElement;

      // Make sure video has dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('[CameraVision] Video not ready yet (no dimensions).');
        return null;
      }

      // Set canvas to video dimensions (capped for performance)
      const maxDim = 640;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      this.canvasElement.width = w;
      this.canvasElement.height = h;

      const ctx = this.canvasElement.getContext('2d');
      if (!ctx) return null;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, w, h);

      // Convert to base64 JPEG (quality 0.6 for bandwidth)
      const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);

      // Strip the "data:image/jpeg;base64," prefix — Gemini expects raw base64
      const base64 = dataUrl.split(',')[1];
      return base64 || null;
    } catch (err) {
      console.error('[CameraVision] captureFrame error:', err);
      return null;
    }
  }

  /**
   * Internal cleanup — release stream, remove DOM elements.
   */
  private cleanup(): void {
    // Stop all tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log('[CameraVision] Track stopped:', track.label);
      });
      this.stream = null;
    }

    // Remove hidden video element
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Release canvas
    this.canvasElement = null;

    this._isActive = false;
    console.log('[CameraVision] Cleanup complete.');
  }
}

/** Singleton instance */
export const cameraVisionService = new CameraVisionServiceImpl();
