import { useState, useEffect, useRef } from 'react';
import { Camera, X, Check, Video, AlertTriangle } from 'lucide-react';

interface CameraCaptureModalProps {
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
  isEmbedded?: boolean;
}

export function CameraCaptureModal({ onClose, onCapture, title = "Capture Photo", isEmbedded = false }: CameraCaptureModalProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  // 1. Detect connected cameras
  useEffect(() => {
    isMountedRef.current = true;
    async function getCameras() {
      try {
        setIsLoading(true);
        setPermissionError(null);
        
        // Request camera permission to obtain active stream and device labels
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Stop the initial temporary stream so we can bind to selected device correctly
        initialStream.getTracks().forEach(track => track.stop());

        if (!isMountedRef.current) return;

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        
        setDevices(videoDevices);
        
        if (videoDevices.length > 0) {
          // Select default device (first one)
          setSelectedDevice(videoDevices[0].deviceId);
        } else {
          setPermissionError("No camera hardware found on this system.");
        }
      } catch (err: any) {
        console.error("Failed to access camera hardware:", err);
        if (isMountedRef.current) {
          setPermissionError(
            err?.message?.includes("Permission denied") || err?.name === "NotAllowedError"
              ? "Camera access denied. Please enable camera permissions in your OS or browser settings."
              : `Failed to open camera: ${err?.message || "Unknown hardware error"}`
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }
    getCameras();
    return () => {
      isMountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // 2. Start/Restart the video stream when selected camera changes
  useEffect(() => {
    if (selectedDevice && !capturedImage) {
      startStream(selectedDevice);
    }
  }, [selectedDevice, capturedImage]);

  const startStream = async (deviceId: string) => {
    stopStream();
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      // If the component was unmounted while waiting for the media stream, stop it immediately!
      if (!isMountedRef.current) {
        newStream.getTracks().forEach(track => track.stop());
        return;
      }

      setStream(newStream);
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error("Error starting camera stream:", err);
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  };

  // 3. Capture snapshot from current video frame
  const handleSnap = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw the frame directly
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setCapturedImage(dataUrl);
        stopStream(); // Save resource consumption once image is captured
      }
    }
  };

  // 4. Save and return standard File object to handler
  const handleSave = () => {
    if (capturedImage) {
      fetch(capturedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
          onClose();
        })
        .catch(err => {
          console.error("Failed to generate file from snapshot:", err);
        });
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    if (selectedDevice) {
      startStream(selectedDevice);
    }
  };

  const cardContent = (
    <div className="bg-white border border-black/15 rounded-none shadow-2xl max-w-md w-full flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-black/15 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Camera className="w-4 h-4 text-yellow-600 animate-pulse" />
          {title}
        </h3>
        <button 
          type="button"
          onClick={onClose} 
          className="p-1.5 hover:bg-gray-100 rounded-none border border-black/15 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Camera Selector Dropdown */}
      {devices.length > 1 && !capturedImage && (
        <div className="px-5 py-2.5 bg-gray-50 border-b border-black/15 flex items-center gap-2.5">
          <Video className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-500">Select Camera:</span>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="text-xs bg-white border border-black/15 rounded-none px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none font-semibold text-gray-700"
          >
            {devices.map((device, i) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Webcam ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Viewport Area */}
      <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden border-b border-black/15 w-full">
        {isLoading ? (
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white text-xs font-medium uppercase tracking-wider">Detecting hardware...</p>
          </div>
        ) : permissionError ? (
          <div className="text-center p-6 space-y-3 max-w-sm">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <h4 className="text-white font-bold text-sm">Access Restricted</h4>
            <p className="text-gray-400 text-xs leading-relaxed">{permissionError}</p>
          </div>
        ) : capturedImage ? (
          <img src={capturedImage} alt="Captured preview" className="w-full h-full object-cover bg-neutral-900" />
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            className="w-full h-full object-cover scale-x-[-1]" // Mirror display for intuitive alignment
          />
        )}
      </div>

      {/* Actions Footer */}
      <div className="p-4 border-t border-black/15 flex items-center justify-between bg-gray-50">
        {capturedImage ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="px-4 py-2 border border-black/15 text-gray-700 hover:bg-gray-100 font-bold text-sm rounded-none transition-colors cursor-pointer"
            >
              Retake Photo
            </button>
            
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm border border-black/15 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" /> Save Photo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-black/15 text-gray-500 hover:bg-gray-100 font-bold text-sm rounded-none transition-colors cursor-pointer"
            >
              Cancel
            </button>
            
            <button
              type="button"
              onClick={handleSnap}
              disabled={!stream || !!permissionError || isLoading}
              className="px-5 py-2 bg-black hover:bg-black/90 text-white font-bold text-sm border border-black/15 transition-all flex items-center justify-center gap-2 shadow-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:border-black/5 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Capture Snapshot
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (isEmbedded) {
    return cardContent;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ zIndex: 9999 }}
    >
      {cardContent}
    </div>
  );
}
