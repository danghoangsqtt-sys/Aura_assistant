import React, { useEffect, useRef, useState } from 'react';

// Use type-only imports to prevent Vite from bundling the actual libraries
import type * as PIXIType from 'pixi.js';
import type { Live2DModel as Live2DModelType } from 'pixi-live2d-display';
import { AppMode, EyeState } from '../types';
import { CHARACTER_MODELS } from '../constants/characters';

interface Live2DAvatarProps {
  state: EyeState;
  mode: AppMode;
  volume: number;
  modelUrl?: string; // Fallback url
}

const Live2DAvatar: React.FC<Live2DAvatarProps> = ({ state, mode, volume, modelUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXIType.Application | null>(null);
  const modelRef = useRef<Live2DModelType | null>(null);
  const isInitialized = useRef<boolean>(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const defaultModelUrl = "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json";
  const urlToLoad = modelUrl || defaultModelUrl;

  const volumeRef = useRef(volume);
  const stateRef = useRef(state);
  useEffect(() => {
      volumeRef.current = volume;
      stateRef.current = state;
  }, [volume, state]);

  useEffect(() => {
    // BUG-H04 FIX: Guard uses a local cancelled flag, not isInitialized.current.
    // isInitialized.current is reset in cleanup, allowing rapid model changes to kick off a new load.
    if (isInitialized.current || !containerRef.current) return;
    isInitialized.current = true;
    let isMounted = true;

    // PIXI and pixi-live2d-display are loaded via CDN in index.html
    const PIXI = (window as any).PIXI;
    const Live2DModel = PIXI?.live2d?.Live2DModel || (window as any).PIXI?.live2d?.Live2DModel;

    if (!PIXI || !Live2DModel) {
      console.error('PIXI or Live2DModel not found on window object. CDNs might have failed to load.');
      setStatus('error');
      return;
    }

    try {
      // 3. Initialize PIXI Application
      const app = new PIXI.Application({
        resizeTo: containerRef.current!,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      
      appRef.current = app as any;
      containerRef.current!.appendChild(app.view as HTMLCanvasElement);
      setStatus('loading');

      // Clean up previous model before loading new one
      if (modelRef.current) {
        app.stage.removeChild(modelRef.current as any);
        modelRef.current.destroy();
        modelRef.current = null;
      }

      // 4. Load Live2D Model
      Live2DModel.from(urlToLoad).then((model: any) => {
        if (!isMounted) {
          model.destroy();
          return;
        }
        modelRef.current = model; // Store ref for LipSync
        app.stage.addChild(model);

        const fitModel = () => {
          if (!containerRef.current) return;
          
          const internalAny = (model as any).internalModel;
          const originalWidth = internalAny.width || 1;
          const originalHeight = internalAny.height || 1;
          
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;

          // Find character config matching this URL
          const currentModelConfig = Object.values(CHARACTER_MODELS).find(c => c.url === urlToLoad);
          const displayMode = currentModelConfig?.displayMode || 'portrait';

          // DO NOT set model.anchor — it conflicts with Cubism 2/3 internal matrices
          if ((model as any).anchor) {
            (model as any).anchor.set(0, 0);
          }

          if (displayMode === 'portrait') {
            // === UPPER-HALF PORTRAIT CROP (Haru, Hiyori) ===
            const scaleByHeight = (containerHeight / originalHeight) * 2.0;
            const scaleByWidth = (containerWidth / originalWidth) * 0.85;
            const finalScale = Math.max(scaleByHeight, scaleByWidth);

            model.scale.set(finalScale, finalScale);
            model.x = (containerWidth - originalWidth * finalScale) / 2;
            model.y = containerHeight * 0.03;

          } else {
            // === FULL-BODY FIT (Shizuku, Wanko) ===
            const scaleX = containerWidth / originalWidth;
            const scaleY = containerHeight / originalHeight;
            
            // Fit to ensure nothing is cut off, then zoom slightly (1.25x) 
            const finalScale = Math.min(scaleX, scaleY) * 1.25;
            
            model.scale.set(finalScale, finalScale);
            model.x = (containerWidth - originalWidth * finalScale) / 2;
            // Center exactly vertically, giving padding to top and bottom
            model.y = (containerHeight - originalHeight * finalScale) / 2;
          }
        };


        fitModel();
        setStatus('ready');

        // Global Pointer tracking
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current || !modelRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            modelRef.current.focus(x, y);
        };
        window.addEventListener('mousemove', handleMouseMove);

        // Store cleanup directly on model so we can remove it on unmount
        (model as any)._cleanupMouseMove = () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };

        // HIGH-PERFORMANCE LIP-SYNC
        // Track the value locally in JS to ELIMINATE expensive WASM reads
        let currentOpen = 0; 

        const lipSyncUpdate = () => {
            const coreModel = model.internalModel.coreModel as any;
            if (!coreModel) return;

            const vol = volumeRef.current;
            let targetOpen = 0;
            
            if (stateRef.current === EyeState.SPEAKING || vol > 0.05) {
                targetOpen = vol > 1.0 ? Math.min(1.0, vol / 60.0) : Math.min(1.0, vol * 5.0);
            }

            // Pure JS math (Super fast, zero main-thread blocking)
            currentOpen += (targetOpen - currentOpen) * 0.4;

            // Write to WASM — detect Cubism version at runtime to prevent crashes
            if (currentOpen > 0.01 || targetOpen === 0) {
                if (typeof coreModel.setParameterValueById === 'function') {
                    // Cubism 3/4/5
                    coreModel.setParameterValueById('ParamMouthOpenY', currentOpen);
                    coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', currentOpen);
                } else if (typeof coreModel.setParamFloat === 'function') {
                    // Cubism 2 (Legacy)
                    coreModel.setParamFloat('PARAM_MOUTH_OPEN_Y', currentOpen);
                }
            }
        };

        // Attach to Live2D's internal update cycle, NOT the global PIXI ticker
        model.internalModel.on('beforeModelUpdate', lipSyncUpdate);

        // Save cleanup reference
        (model as any)._cleanupLipSync = () => {
            model.internalModel.off('beforeModelUpdate', lipSyncUpdate);
        };

      }).catch((err: any) => {
        console.error('Failed to load Live2D model:', err);
        if (isMounted) setStatus('error');
      });
    } catch (err) {
      console.error('Error initializing Live2D PIXI app:', err);
      if (isMounted) setStatus('error');
    }

    // BUG-H04 FIX: Reset isInitialized FIRST in cleanup so the next render can initialize.
    return () => {
      isInitialized.current = false; // Reset BEFORE anything else
      isMounted = false;
      
      if (modelRef.current) {
         if ((modelRef.current as any)._cleanupMouseMove) {
             (modelRef.current as any)._cleanupMouseMove();
         }
         if ((modelRef.current as any)._cleanupLipSync) {
             (modelRef.current as any)._cleanupLipSync();
         }
         modelRef.current.destroy();
         modelRef.current = null;
      }

      if (appRef.current) {
        // Destroy PIXI App safely
        appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        appRef.current = null;
      }
      
      if (containerRef.current) {
          containerRef.current.innerHTML = '';
      }
    };
  }, [urlToLoad]);



  // Handle Resize natively through PIXI resizeTo
  useEffect(() => {
    const handleResize = () => {
        if (appRef.current && modelRef.current && containerRef.current) {
             const model = modelRef.current as any;
             const internalAny = model.internalModel;

             if (internalAny) {
                 const modelWidth = internalAny.width || 1;
                 const modelHeight = internalAny.height || 1;
                 const containerWidth = containerRef.current.clientWidth;
                 const containerHeight = containerRef.current.clientHeight;

                 // BUG-M03 FIX: Read displayMode from CHARACTER_MODELS like fitModel() does
                 const currentModelConfig = Object.values(CHARACTER_MODELS).find(c => c.url === urlToLoad);
                 const displayMode = currentModelConfig?.displayMode || 'portrait';

                 if (displayMode === 'portrait') {
                   // Portrait: scale to fill height, crop sides
                   const targetScaleY = (containerHeight / modelHeight) * 2.0;
                   const targetScaleX = (containerWidth / modelWidth) * 1.1;
                   const scale = Math.max(targetScaleX, targetScaleY);
                   model.scale.set(scale);
                   model.x = (containerWidth - modelWidth * scale) / 2;
                   model.y = containerHeight * 0.05;
                 } else {
                   // Full body: fit inside container
                   const scaleX = containerWidth / modelWidth;
                   const scaleY = containerHeight / modelHeight;
                   const scale = Math.min(scaleX, scaleY) * 1.25;
                   model.scale.set(scale);
                   model.x = (containerWidth - modelWidth * scale) / 2;
                   model.y = (containerHeight - modelHeight * scale) / 2;
                 }
             }
        }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-auto" />
      {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
      )}
      {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 text-center">
             <span className="text-red-500 text-sm bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20">
               Lỗi tải mô hình Live2D
             </span>
          </div>
      )}
    </div>
  );
};

export default Live2DAvatar;

