export function ScoreBlock({ score, formula, justification, verdictLabel }: {
  score: number; formula: string; justification: string | null; verdictLabel?: string;
}) {
  return (
    <div>
      <div className="score" data-testid="score">{score}<sub>/100</sub></div>
      <div className="formula">{formula}</div>
      {justification && <p className="justif">{verdictLabel && <b>Verdict Claude : {verdictLabel}. </b>}{justification}</p>}
    </div>
  );
}
