'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: { background: '#1D2C47', border: '1px solid #2A3A57', color: '#F1ECE2' },
        }}
      />
    </MotionConfig>
  );
}
