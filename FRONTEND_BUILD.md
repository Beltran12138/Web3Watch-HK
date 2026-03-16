# 前端构建流程说明

## 目录结构

项目有两套前端代码：

```
alpha-radar/
├── public/                    # 生产环境（已构建）
│   ├── index.html             # 主页面
│   ├── app.js                 # 打包后的 React 应用
│   ├── components.js          # UI 组件库
│   ├── sw.js                  # Service Worker
│   └── src/
│       └── app.jsx            # React 源代码（63KB）
│
└── frontend/                  # 开发环境（源代码）
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx           # 入口文件
        ├── App.jsx            # 主组件
        └── index.css          # 样式
```

## 构建方式

### 方式 A：使用 npm 脚本（推荐）

```bash
# 构建生产版本
npm run build
# 或
npm run build:frontend
```

这会执行 `scripts/build-frontend.js`，将 `public/src/app.jsx` 打包为 `public/app.js`。

### 方式 B：使用 Vite 开发模式

```bash
cd frontend
npm install
npm run dev
```

这会在 `http://localhost:5173` 启动开发服务器，支持热重载。

### 方式 C：使用 Vite 构建

```bash
cd frontend
npm run build
```

这会将输出到 `frontend/dist/` 目录。

## 构建流程详解

### scripts/build-frontend.js

这个脚本使用 esbuild 进行快速打包：

1. **输入**: `public/src/app.jsx` (63KB React JSX)
2. **处理**: 
   - Bundling（合并依赖）
   - Minification（压缩代码）
   - JSX 转换
3. **输出**: `public/app.js` (42KB 压缩后)
4. **外部依赖**（从 CDN 加载）:
   - React 18
   - React DOM 18
   - Supabase JS SDK
   - ECharts 5

### 环境变量

构建时会注入以下环境变量：

```js
process.env.NODE_ENV = 'production'
```

## 开发工作流

### 日常开发

1. **修改源码**: 编辑 `public/src/app.jsx` 或 `frontend/src/*`
2. **测试**: 
   - 开发模式：`cd frontend && npm run dev`
   - 生产模式：`npm run build && npm start`
3. **构建**: `npm run build:frontend`
4. **部署**: 自动由 Vercel/GitHub Actions 处理

### 添加新依赖

如果需要在 React 中使用新库：

1. **安装依赖**:
   ```bash
   cd frontend
   npm install <package-name>
   ```

2. **在 JSX 中导入**:
   ```jsx
   import { something } from 'package-name';
   ```

3. **更新构建配置** (如果需要):
   
   编辑 `scripts/build-frontend.js`，将新包添加到 `external` 数组（如果是大依赖想从 CDN 加载）：
   ```js
   external: [
     'https://unpkg.com/react@18/*',
     'https://unpkg.com/react-dom@18/*',
     // 添加新的 CDN 依赖
   ],
   ```

## 为什么有两套前端代码？

- **`frontend/`**: 用于未来完全迁移到 Vite + React 的标准开发流程
- **`public/src/`**: 当前的主要开发目录，直接服务于 Express 静态文件

当前建议：
- **继续在主目录开发**: 直接在 `public/src/app.jsx` 修改
- **使用 esbuild 构建**: `npm run build:frontend` 快速打包
- **未来计划**: 可以完全迁移到 `frontend/` + Vite 的标准流程

## 故障排除

### 问题：构建失败 "esbuild not installed"

**解决**:
```bash
npm install --save-dev esbuild
```

### 问题：前端显示空白页

**检查**:
1. 浏览器控制台是否有错误
2. 确认 `public/app.js` 存在
3. 重新构建：`npm run build:frontend`

### 问题：修改后没有生效

**解决**:
1. 清除浏览器缓存（Ctrl+Shift+R）
2. 重新构建：`npm run build:frontend`
3. 重启服务：`npm start`

## 性能优化建议

1. **代码分割**: 将大组件拆分为独立文件，使用动态导入
   ```jsx
   const Chart = React.lazy(() => import('./Chart.jsx'));
   ```

2. **CDN 预加载**: 在 HTML 中添加
   ```html
   <link rel="preconnect" href="https://unpkg.com">
   ```

3. **Service Worker 缓存**: 已在 `sw.js` 中配置，自动缓存静态资源

4. **图片优化**: 使用 WebP 格式，添加响应式图片
   ```html
   <picture>
     <source srcset="logo.webp" type="image/webp">
     <img src="logo.png" alt="Logo">
   </picture>
   ```
