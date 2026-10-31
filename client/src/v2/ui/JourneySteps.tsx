export function JourneySteps({ active }: { active: 1 | 2 | 3 }) {
  return <ol className="journey-steps" aria-label="Find a library copy">
    {['Find a book', 'Choose a library', 'Check availability'].map((label, index) => <li key={label} aria-current={active === index + 1 ? 'step' : undefined} data-complete={active > index + 1}>
      <span aria-hidden="true">{active > index + 1 ? '✓' : index + 1}</span>{label}
    </li>)}
  </ol>;
}
