module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
    browser: true, // 浏览器环境（PUPPeteer/前端）
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script', // CommonJS
  },
  rules: {
    // 错误预防
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off', // 允许 console，但建议使用 logger
    'no-debugger': 'warn',
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'warn',
    'no-useless-escape': 'off', // 正则表达式中的转义字符可以提高可读性

    // 最佳实践
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'curly': ['error', 'multi-line'],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'warn',
    'arrow-body-style': ['warn', 'as-needed'],
    'object-shorthand': 'warn',

    // 代码风格
    'indent': ['error', 2, { SwitchCase: 1 }],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',

    // Node.js 特定
    'no-process-exit': 'warn',
    'no-sync': 'off', // 允许同步操作（SQLite 需要）
  },
  overrides: [
    {
      // 测试文件使用更宽松的规则
      files: ['tests/**/*.js', '*.test.js'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Service Worker 文件 (public/sw.js)
      files: ['public/sw.js'],
      env: {
        serviceworker: true,
      },
    },
    {
      // Puppeteer 页面环境脚本
      files: ['scrapers/sources/puppeteer.js', 'scrapers/middleware.js', 'scrapers/browser.js', 'inspect_dom.js'],
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'public/app.js',
    'dist/',
    'build/',
    '*.db',
    '.vercel/',
  ],
};
