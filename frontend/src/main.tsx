import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prevent zoom-out, pinch-zoom, and unwanted elastic gestures on mobile
if (typeof window !== 'undefined') {
  document.addEventListener('gesturestart', (e: Event) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e: Event) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e: Event) => e.preventDefault(), { passive: false });

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        const target = e.target as HTMLElement;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
          return;
        }
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
