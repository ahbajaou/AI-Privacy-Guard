import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageMetadata = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function syncExtensionVersion(diagnosticsBuild, outputDirectory) {
  return {
    name: 'sync-extension-version',
    closeBundle() {
      const manifestPath = resolve(outputDirectory, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: packageMetadata.version }, null, 2)}\n`)
      if (!diagnosticsBuild) {
        const contentPath = resolve(outputDirectory, 'content.js')
        const source = readFileSync(contentPath, 'utf8')
        const stripped = source.replace(/\/\* AIPG_DIAGNOSTICS_ONLY_START \*\/[\s\S]*?\/\* AIPG_DIAGNOSTICS_ONLY_END \*\//g, '')
        if (stripped.includes('AIPG_GET_DIAGNOSTICS') || stripped.includes('getDiagnostics')) {
          throw new Error('Development diagnostics remain in the production content script.')
        }
        writeFileSync(contentPath, stripped.replace(/^[ \t]+$/gm, ''))
      }
    },
  }
}

function stripProductionDiagnosticStyles(diagnosticsBuild) {
  return {
    name: 'strip-production-diagnostic-styles',
    enforce: 'pre',
    transform(code, id) {
      if (diagnosticsBuild || !id.includes('/src/App.css')) return null
      return code.replace(/\/\* AIPG_DIAGNOSTICS_ONLY_START \*\/[\s\S]*?\/\* AIPG_DIAGNOSTICS_ONLY_END \*\//g, '')
    },
  }
}

function stripProductionDiagnosticPopup(diagnosticsBuild) {
  return {
    name: 'strip-production-diagnostic-popup',
    enforce: 'pre',
    transform(code, id) {
      if (diagnosticsBuild || !id.includes('/src/App.jsx')) return null
      const stripped = code
        .replace(/\/\* AIPG_DIAGNOSTICS_ONLY_START \*\/[\s\S]*?\/\* AIPG_DIAGNOSTICS_ONLY_END \*\//g, '')
        .replace(/\{\/\* AIPG_DIAGNOSTICS_ONLY_START \*\/\}[\s\S]*?\{\/\* AIPG_DIAGNOSTICS_ONLY_END \*\/\}/g, '')
      if (stripped.includes('copyDiagnostics') || stripped.includes('Copy diagnostics')) {
        throw new Error('Development diagnostics remain in the production popup source.')
      }
      return stripped
    },
  }
}

export default defineConfig(({ mode }) => {
  const diagnosticsBuild = mode === 'diagnostics'
  const outputDirectory = diagnosticsBuild ? 'build-diagnostics' : 'build'

  return {
    plugins: [
      react(),
      stripProductionDiagnosticStyles(diagnosticsBuild),
      stripProductionDiagnosticPopup(diagnosticsBuild),
      syncExtensionVersion(diagnosticsBuild, outputDirectory),
    ],
    define: {
      'globalThis.AIPG_DIAGNOSTICS_ENABLED': JSON.stringify(diagnosticsBuild),
    },
    build: {
      outDir: outputDirectory,
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  }
});
