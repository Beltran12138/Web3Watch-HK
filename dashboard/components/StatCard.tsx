export default function StatCard({
  value,
  label,
  sub,
  color = 'text-brand',
}: {
  value: string | number;
  label: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
