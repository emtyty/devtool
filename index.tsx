
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
const statusText = document.getElementById('status-text');
const errorDisplay = document.getElementById('error-display');
const errorText = document.getElementById('error-text');
const loadingIcon = document.getElementById('loading-icon');

function showError(msg: string) {
  if (statusText) statusText.innerText = "CRITICAL BOOT FAILURE";
  if (errorDisplay) errorDisplay.style.display = 'block';
  if (errorText) errorText.innerText = msg;
  if (loadingIcon) {
    loadingIcon.classList.remove('fa-spin-pulse', 'fa-fingerprint');
    loadingIcon.classList.add('fa-triangle-exclamation');
    loadingIcon.style.color = '#ef4444';
  }
}

// Global catch for any async errors during boot (like Worker/WASM failures)
window.addEventListener('unhandledrejection', (event) => {
  showError(`Module Load Error: ${event.reason}`);
});

if (!rootElement) {
  showError("Target root element '#root' not found.");
} else {
  try {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error: any) {
    showError(error.message || "Unknown error during React mount.");
  }
}
