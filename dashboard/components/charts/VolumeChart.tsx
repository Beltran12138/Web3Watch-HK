'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export default function VolumeChart({
  data,
}: {
  data: { date: string; total: number; important: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="total"     name="总条数"   fill="#93c5fd" radius={[3,3,0,0]} />
        <Bar dataKey="important" name="重要 ≥75" fill="#00A7E1" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
