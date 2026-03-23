import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Patch html-query-plan to fix issues
const qpPath = path.resolve(__dirname, 'node_modules/html-query-plan/dist/qp.js');
if (fs.existsSync(qpPath)) {
  let content = fs.readFileSync(qpPath, 'utf-8');
  let modified = false;
  
  // Fix "this.SVG" issue
  if (content.includes('var SVG = this.SVG = function(element)')) {
    content = content.replace('var SVG = this.SVG = function(element)', 'var SVG = window.SVG = function(element)');
    modified = true;
  }
  
  // Fix "getBoundingClientRect" root is null issue
  if (content.includes('var root = container.querySelector(".qp-root");\n    var draw = SVG(root);')) {
    content = content.replace(
      'var root = container.querySelector(".qp-root");\n    var draw = SVG(root);',
      'var root = container.querySelector(".qp-root");\n    if (!root) return;\n    var draw = SVG(root);'
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(qpPath, content);
  }
}

export default defineConfig(({mode: _mode}) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
          allow: ['.', './node_modules'],
        },
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      plugins: [react()],
      assetsInclude: ['**/*.wasm'],
      optimizeDeps: {
        include: ['@uswriting/exiftool', '@6over3/zeroperl-ts'],
        exclude: []
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        globals: true,
      }
    };
});
