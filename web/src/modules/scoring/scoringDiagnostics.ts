/**
 * Scoring Diagnostics — Phase 4 (ACE v1.2)
 * Collects diagnostics during the scoring pipeline run.
 */

export interface ScoringDiagnosticsCollector {
  addMissingEvidence(metric: string, evidence: string): void;
  addAbsenceEvidence(metric: string, absence: string): void;
  addScoringWarning(warning: string): void;
  setContamination(contamination: boolean, type?: string): void;
  setNormalizationWarnings(warnings: string[]): void;
  build(): {
    missingEvidence: string[];
    absenceEvidence: string[];
    contamination: boolean;
    contaminationType?: string;
    normalizationWarnings: string[];
    scoringWarnings: string[];
  };
}

/**
 * Create a scoring diagnostics collector.
 * @returns Diagnostics collector instance.
 */
export function createScoringDiagnostics(): ScoringDiagnosticsCollector {
  const missingEvidence: string[] = [];
  const absenceEvidence: string[] = [];
  const scoringWarnings: string[] = [];
  let contamination = false;
  let contaminationType: string | undefined;
  let normalizationWarnings: string[] = [];

  return {
    addMissingEvidence(metric: string, evidence: string) {
      missingEvidence.push(`[${metric}] ${evidence}`);
    },
    addAbsenceEvidence(metric: string, absence: string) {
      absenceEvidence.push(`[${metric}] ${absence}`);
    },
    addScoringWarning(warning: string) {
      scoringWarnings.push(warning);
    },
    setContamination(cont: boolean, type?: string) {
      contamination = cont;
      contaminationType = type;
    },
    setNormalizationWarnings(warnings: string[]) {
      normalizationWarnings = [...warnings];
    },
    build() {
      return {
        missingEvidence,
        absenceEvidence,
        contamination,
        contaminationType,
        normalizationWarnings,
        scoringWarnings,
      };
    },
  };
}
