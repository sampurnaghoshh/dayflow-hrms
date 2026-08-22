export default function Card({ as: Tag = 'div', title, className = '', children, ...rest }) {
  return (
    <Tag className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${className}`} {...rest}>
      {title && <h3 className="mb-3 text-sm font-semibold text-text">{title}</h3>}
      {children}
    </Tag>
  );
}
