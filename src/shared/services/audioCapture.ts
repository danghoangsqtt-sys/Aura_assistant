import { float32ToInt16, arrayBufferToBase64 } from "../utils/audioUtils";

export interface AudioCaptureCallbacks {
  onAudioData: (base64: string) => void;
  onVolumeChange: (volume: number) => void;
  onError: (msg: string) => void;
}

export class AudioCaptureService {
  private static sharedInputContext: AudioContext | null = null;
  private static workletLoaded = false;
  
  private inputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  public gainNode: GainNode | null = null;
  private processor: ScriptProcessorNode | any = null;

  private lastVolumeUpdate = 0;
  private isConnected = false;

  constructor(private callbacks: AudioCaptureCallbacks) {}

  public async startAudioInput(sensitivity: number = 1.5, meetingMode: boolean = false) {
    if (this.isConnected) this.cleanupAudioInput();

    try {
      if (!AudioCaptureService.sharedInputContext || AudioCaptureService.sharedInputContext.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        AudioCaptureService.sharedInputContext = new AudioCtx({ sampleRate: 16000 });
      }
      this.inputAudioContext = AudioCaptureService.sharedInputContext;

      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }

      // Meeting mode: disable echo cancellation and noise suppression to capture ALL room audio.
      // BUT keep autoGainControl ON — browser will boost quiet/distant speech automatically.
      const audioConstraints: MediaTrackConstraints = meetingMode
        ? {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true, // MUST be ON to amplify distant/quiet speakers
            // @ts-ignore
            googEchoCancellation: false,
            // @ts-ignore
            googNoiseSuppression: false,
            // @ts-ignore
            googHighpassFilter: false,
            // @ts-ignore
            googAutoGainControl: true, // Chrome-specific AGC ON for meeting mode
          }
        : {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // @ts-ignore
            googEchoCancellation: true,
            // @ts-ignore
            googNoiseSuppression: true,
            // @ts-ignore
            googHighpassFilter: true,
            // @ts-ignore
            googAutoGainControl: true,
          };

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

      this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
      this.highPassFilter = this.inputAudioContext.createBiquadFilter();
      this.highPassFilter.type = "highpass";
      // Meeting mode: lower cutoff (40Hz) to preserve bass tones from distant speakers
      this.highPassFilter.frequency.value = meetingMode ? 40 : 80;
      this.lowPassFilter = this.inputAudioContext.createBiquadFilter();
      this.lowPassFilter.type = "lowpass";
      // Meeting mode: wider range (8000Hz) to capture more vocal harmonics from far-field audio
      this.lowPassFilter.frequency.value = meetingMode ? 8000 : 7500;
      this.gainNode = this.inputAudioContext.createGain();
      this.gainNode.gain.value = sensitivity;

      if (!AudioCaptureService.workletLoaded) {
        const workletCode = `
          class PCMProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input && input.length > 0) {
                const channelData = input[0];
                this.port.postMessage(channelData); 
              }
              return true;
            }
          }
          registerProcessor('pcm-processor', PCMProcessor);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        await this.inputAudioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);
        AudioCaptureService.workletLoaded = true;
      }

      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }
      
      const processorNode = new AudioWorkletNode(this.inputAudioContext, 'pcm-processor') as any;

      const bufferSize = 1024;
      const pcmBuffer = new Float32Array(16384);
      const sendChunk = new Float32Array(bufferSize);
      let bufferLength = 0;

      processorNode.port.onmessage = (event: MessageEvent) => {
        const channelData = event.data;
        
        if (bufferLength + channelData.length > pcmBuffer.length) {
          if (bufferLength >= bufferSize) {
            sendChunk.set(pcmBuffer.subarray(0, bufferSize));
            try {
              const pcm16 = float32ToInt16(sendChunk as any);
              const base64 = arrayBufferToBase64(pcm16.buffer as any);
              this.callbacks.onAudioData(base64);
            } catch (e) { console.warn('Flush error', e); }
          }
          bufferLength = 0;
        }

        pcmBuffer.set(channelData, bufferLength);
        bufferLength += channelData.length;

        while (bufferLength >= bufferSize) {
          sendChunk.set(pcmBuffer.subarray(0, bufferSize));
          pcmBuffer.copyWithin(0, bufferSize, bufferLength);
          bufferLength -= bufferSize;

          let sum = 0;
          for (let i = 0; i < sendChunk.length; i++) sum += sendChunk[i] * sendChunk[i];
          const rms = Math.sqrt(sum / sendChunk.length);

          const now = performance.now();
          if (now - this.lastVolumeUpdate > 250) {
            this.callbacks.onVolumeChange(rms * 100);
            this.lastVolumeUpdate = now;
          }

          try {
            const pcm16 = float32ToInt16(sendChunk as any);
            const base64 = arrayBufferToBase64(pcm16.buffer as any);
            this.callbacks.onAudioData(base64);
          } catch (e) { console.error('Audio encode error', e); }
        }
      };

      this.processor = processorNode;
      this.source.connect(this.highPassFilter);
      this.highPassFilter.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.gainNode);
      
      if (meetingMode) {
        // Add compressor for meeting mode: makes quiet sounds louder, prevents clipping
        const compressor = this.inputAudioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;  // Start compressing at -50dB (captures quiet sounds)
        compressor.knee.value = 40;        // Soft knee for natural sound
        compressor.ratio.value = 12;       // High ratio = aggressive boost for quiet audio
        compressor.attack.value = 0.003;   // Fast attack to catch transients
        compressor.release.value = 0.25;   // Quick release for responsive gain changes
        this.gainNode.connect(compressor);
        compressor.connect(this.processor);
      } else {
        this.gainNode.connect(this.processor);
      }
      this.processor.connect(this.inputAudioContext.destination);
      
      this.isConnected = true;

    } catch (error: any) {
      console.error("Mic error:", error);
      this.cleanupAudioInput();
      this.callbacks.onError("Lỗi Microphone: " + (error.message || "Không thể truy cập"));
    }
  }

  public cleanupAudioInput() {
    this.isConnected = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.processor) {
      if (this.processor.port) {
          this.processor.port.onmessage = null;
      } else {
          this.processor.onaudioprocess = null;
      }
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.lowPassFilter) {
      this.lowPassFilter.disconnect();
      this.lowPassFilter = null;
    }
    if (this.highPassFilter) {
      this.highPassFilter.disconnect();
      this.highPassFilter = null;
    }
  }

  public suspendContext() {
     if (this.inputAudioContext && this.inputAudioContext.state === 'running') {
       this.inputAudioContext.suspend();
     }
  }

  public setGainTarget(target: number, durationMs: number) {
    if (!this.gainNode) return;
    this.gainNode.gain.cancelScheduledValues(this.gainNode.context.currentTime);
    this.gainNode.gain.setTargetAtTime(target, this.gainNode.context.currentTime, durationMs / 1000);
  }
}
