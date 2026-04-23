'use client';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = [
  '#00A7E1', '#0077b6', '#f5a623', '#d32f2f', '#388e3c',
  '#7b1fa2', '#0288d1', '#f57c00', '#455a64', '#c62828',
  '#2e7d32', '#1565c0', '#6a1b9a', '#ad1457', '#4527a0',
];

export default function CategoryChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={120}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [`${v} 条`, '数量']} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
