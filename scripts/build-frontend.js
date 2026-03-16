#!/usr/bin/env node
'use strict';

/**
 * 前端构建脚本
 * 将 React + 其他依赖打包为单个 bundle，减少 CDN 依赖
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SRC_DIR = path.join(PUBLIC_DIR, 'src');
const OUT_FILE = path.join(PUBLIC_DIR, 'app.js');

// 检查 esbuild 是否可用
let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  console.log('esbuild not installed, using fallback build method');
  process.exit(0); // 不阻断，使用原始 CDN 方式
}

async function build() {
  console.log('Building frontend bundle...');

  try {
    // 构建 JSX 文件
    await esbuild.build({
      entryPoints: [path.join(SRC_DIR, 'app.jsx')],
      bundle: true,
      outfile: OUT_FILE,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      sourcemap: true,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      external: [
        // 仍然从 CDN 加载的大依赖
        'https://unpkg.com/react@18/*',
        'https://unpkg.com/react-dom@18/*',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        'https://cdn.jsdelivr.net/npm/echarts@5/*',
      ],
      loader: {
        '.jsx': 'jsx',
      },
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    });

    console.log(`✓ Frontend bundle built: ${OUT_FILE}`);
    console.log(`  Size: ${(fs.statSync(OUT_FILE).size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
}

// 如果没有 esbuild，创建简单的合并文件
async function fallbackBuild() {
  console.log('Using fallback build (no bundling)');

  const appJsx = fs.readFileSync(path.join(SRC_DIR, 'app.jsx'), 'utf8');

  // 简单处理：直接复制（保持原有 CDN 依赖方式）
  const wrapped = `
// Fallback build - CDN dependencies required
${appJsx}
`;

  fs.writeFileSync(OUT_FILE, wrapped);
  console.log(`✓ Frontend file copied: ${OUT_FILE}`);
}

// 主函数
if (esbuild) {
  build();
} else {
  fallbackBuild();
}
