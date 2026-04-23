'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/',           label: '🏠 今日' },
  { href: '/archive',   label: '📅 历史' },
  { href: '/sources',   label: '📡 数据源' },
  { href: '/analytics', label: '📊 统计' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-2">
          <span className="text-brand font-bold text-lg">🔭</span>
          <span className="font-bold text-gray-900 hidden sm:block">Web3Watch HK</span>
        </div>
        <nav className="flex gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? 'nav-link-active' : 'nav-link'}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <a
          href="https://github.com/Beltran12138/Web3Watch-HK"
          target="_blank"
          rel="noopener"
          className="text-xs text-gray-400 hover:text-brand hidden md:block"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
