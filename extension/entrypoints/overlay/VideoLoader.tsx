import { useEffect, useRef, useState } from 'react';

interface VideoLoaderProps {
  size?: number;
  videoPath?: string;
}

export function VideoLoader({ size = 400, videoPath }: VideoLoaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [useCanvas, setUseCanvas] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get the video URL from extension public directory
  // Note: Browsers don't support .mov files - need MP4 format
  useEffect(() => {
    if (videoPath) {
      setVideoSrc(videoPath);
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      // Try MP4 first (web-compatible), then fallback to MOV
      try {
        // @ts-ignore - browser.runtime.getURL accepts string paths
        const mp4Url = browser.runtime.getURL('0117.mp4');
        setVideoSrc(mp4Url);
      } catch (e) {
        try {
          // @ts-ignore - browser.runtime.getURL accepts string paths
          const movUrl = browser.runtime.getURL('0117.mov');
          setVideoSrc(movUrl);
        } catch (e2) {
          console.error('Could not get video URL:', e2);
          setError('Video file not found. Please convert 0117.mov to 0117.mp4 (H.264)');
        }
      }
    } else {
      // Fallback: try relative paths
      setVideoSrc('/0117.mp4');
    }
  }, [videoPath]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoSrc) return;

    let isMounted = true;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas size - maintain aspect ratio
    video.addEventListener('loadedmetadata', () => {
      if (!isMounted) return;
      const aspectRatio = video.videoWidth / video.videoHeight;
      if (aspectRatio > 1) {
        // Landscape
        canvas.width = size;
        canvas.height = size / aspectRatio;
      } else {
        // Portrait or square
        canvas.width = size * aspectRatio;
        canvas.height = size;
      }
    });

    // Green screen removal function
    const removeGreenScreen = () => {
      if (!ctx || video.readyState < 2 || !video.videoWidth) return;

      // Draw video frame to canvas - maintain aspect ratio
      const aspectRatio = video.videoWidth / video.videoHeight;
      let drawWidth = canvas.width;
      let drawHeight = canvas.height;
      let offsetX = 0;
      let offsetY = 0;

      if (aspectRatio > canvas.width / canvas.height) {
        // Video is wider - fit to width
        drawHeight = canvas.width / aspectRatio;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        // Video is taller - fit to height
        drawWidth = canvas.height * aspectRatio;
        offsetX = (canvas.width - drawWidth) / 2;
      }

      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw video frame to canvas
      ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Chroma key removal - remove green pixels
      // Green screen chroma key algorithm
      // Typical green screen: RGB(0, 177, 64) or RGB(0, 255, 0)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate distance from pure green
        // Using a more sophisticated chroma key algorithm
        const greenAmount = g / 255;
        const redAmount = r / 255;
        const blueAmount = b / 255;
        
        // Green screen detection: green is high, red and blue are low
        const greenDominance = greenAmount - Math.max(redAmount, blueAmount);
        
        // Threshold for green screen (adjustable)
        const threshold = 0.3; // 0.3 = 30% more green than red/blue
        
        if (greenDominance > threshold && greenAmount > 0.4) {
          // Make transparent - use smooth alpha blending for edges
          const alpha = Math.min(1, greenDominance / 0.5); // Smooth transition
          data[i + 3] = Math.round(255 * (1 - alpha));
        }
      }

      // Put processed image data back
      ctx.putImageData(imageData, 0, 0);
    };

    // Process video frames using requestAnimationFrame for smooth playback
    let animationFrameId: number;
    let lastTime = 0;

    const processFrame = (currentTime: number) => {
      if (!isMounted) return;
      // Throttle to ~30fps for performance
      if (currentTime - lastTime >= 33) {
        removeGreenScreen();
        lastTime = currentTime;
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    const handleCanPlay = () => {
      if (!isMounted) return;
      console.log('Video can play, starting processing');
      removeGreenScreen();
      animationFrameId = requestAnimationFrame(processFrame);
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      console.error('Video src:', video.src);
      console.error('Video readyState:', video.readyState);
      console.error('Video error code:', (video as HTMLVideoElement).error?.code);
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Try to play the video
    video.play().catch(err => {
      // Ignore AbortError - this happens when component unmounts during play()
      if (err.name === 'AbortError') return;
      console.error('Video play error:', err);
    });
    
    // Start processing when video can play
    if (video.readyState >= 3) {
      handleCanPlay();
    }

    return () => {
      isMounted = false;
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleCanPlay);
      video.removeEventListener('error', handleError);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [size, videoSrc]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      position: 'relative',
    }}>
      {/* Hidden video element */}
      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          style={{
            display: 'none',
          }}
          onError={(e) => {
            const video = e.target as HTMLVideoElement;
            const error = video.error;
            let errorMsg = 'Video format not supported';
            
            if (error) {
              // Error code 4 = MEDIA_ELEMENT_ERROR: Format error
              if (error.code === 4) {
                errorMsg = 'Video codec not supported. Please convert to H.264 (AVC) codec.';
              } else {
                errorMsg = `Error ${error.code}: ${error.message}`;
              }
            }
            
            console.error('Video loading error:', errorMsg);
            console.error('Video src attempted:', videoSrc);
            console.error('Video error details:', {
              code: error?.code,
              message: error?.message,
              readyState: video.readyState,
            });
            setError(errorMsg);
            setUseCanvas(false); // Fallback to direct video display
          }}
          onLoadStart={() => {
            console.log('Video load started:', videoSrc);
          }}
          onLoadedMetadata={() => {
            console.log('Video metadata loaded:', {
              width: videoRef.current?.videoWidth,
              height: videoRef.current?.videoHeight,
              duration: videoRef.current?.duration,
            });
          }}
        />
      )}
      
      {!videoSrc && (
        <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
          <div>Video file not found</div>
          <div style={{ fontSize: '10px', marginTop: '8px', color: '#475569' }}>
            Please convert 0117.mov to MP4 format (H.264 codec) and save as 0117.mp4 in the public folder
          </div>
        </div>
      )}

      {/* Canvas with green screen removed OR direct video fallback */}
      {useCanvas ? (
        <canvas
          ref={canvasRef}
          style={{
            width: size,
            height: size,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: size,
            height: size,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            filter: 'chroma(0, 255, 0)', // CSS chroma key filter as fallback
          }}
        />
      )}
      
      {error && (
        <div style={{ 
          color: '#fca5a5', 
          fontSize: '11px', 
          marginTop: '8px', 
          textAlign: 'center',
          padding: '12px',
          background: 'rgba(252, 165, 165, 0.1)',
          borderRadius: '6px',
          maxWidth: '300px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Video Error</div>
          <div>{error}</div>
          {error.includes('codec') && (
            <div style={{ fontSize: '10px', marginTop: '8px', color: '#94a3b8' }}>
              Convert using: ffmpeg -i 0117.mov -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k 0117.mp4
            </div>
          )}
        </div>
      )}

    </div>
  );
}

