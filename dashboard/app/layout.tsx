import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Web3Watch HK — 香港 Web3 情报看板',
  description: '全自动香港 Web3 行业情报聚合系统 · 25+ 数据源 · DeepSeek AI 分析',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Nav />
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-gray-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-gray-400">
            <span>Web3Watch HK · 产品部行研组 · DeepSeek AI 驱动</span>
            <a
              href="https://github.com/Beltran12138/Web3Watch-HK"
              target="_blank"
              rel="noopener"
              className="hover:text-brand"
            >
              GitHub →
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
