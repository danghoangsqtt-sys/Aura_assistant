import React, { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

const WebcamPIP: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Webcam access denied or error:", err);
        setHasError(true);
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="absolute bottom-4 right-4 w-28 h-36 lg:w-36 lg:h-48 bg-black/80 rounded-xl border border-white/20 flex flex-col items-center justify-center backdrop-blur-md z-20 overflow-hidden shadow-2xl">
      {hasError ? (
        <div className="flex flex-col items-center text-neutral-500">
          <CameraOff size={24} className="mb-2" />
          <span className="text-[10px] text-center px-2">Camera Disabled</span>
        </div>
      ) : (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover transform -scale-x-100" 
        />
      )}
    </div>
  );
};

export default WebcamPIP;

