import React from 'react';
import { createRoot } from 'react-dom/client';
import ElectronApp from './ElectronApp';
import './index.css';

// Entry point for the Electron parity reference. The Tauri app boots from
// src/main.tsx via index.html; this entry exists so the Electron
// implementation stays runnable while migration parity is verified.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ElectronApp />
  </React.StrictMode>
);
