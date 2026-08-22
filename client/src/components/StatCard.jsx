import Card from './Card.jsx';

const TREND_STYLES = { up: 'text-success', down: 'text-danger', flat: 'text-text-muted' };
const TREND_ICON = { up: '↑', down: '↓', flat: '→' };

// trend: { direction: 'up' | 'down' | 'flat', label: string } — direction only controls
// colour, so callers decide what "up" means for that metric (e.g. up in absences is bad).
export default function StatCard({ label, value, subtext, trend, className = '' }) {
  return (
    <Card className={className}>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
      {(subtext || trend) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {trend && (
            <span className={`font-medium ${TREND_STYLES[trend.direction] ?? TREND_STYLES.flat}`}>
              {TREND_ICON[trend.direction] ?? TREND_ICON.flat} {trend.label}
            </span>
          )}
          {subtext && <span className="text-text-muted">{subtext}</span>}
        </div>
      )}
    </Card>
  );
}
