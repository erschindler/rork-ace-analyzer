/**
 * Normalization Diagnostics — Phase 3
 * Collects warnings, errors, fallback notices, and degraded evidence notices
 * from the normalization process.
 */

/** Normalization diagnostic entry. */
export interface NormalizationDiagnostic {
  type: "warning" | "error" | "fallback" | "degraded";
  message: string;
  section?: string;
  detail?: string;
}

/**
 * Normalization diagnostics collector.
 * Accumulates warnings and errors during the normalization process.
 */
export class NormalizationDiagnostics {
  private readonly warnings: string[] = [];
  private readonly errors: string[] = [];
  private readonly fallbacks: string[] = [];
  private readonly degraded: string[] = [];

  /**
   * Add a warning.
   * @param message Warning message.
   * @param section Optional section name.
   */
  addWarning(message: string, section?: string): void {
    const prefix = section ? `[${section}] ` : "";
    this.warnings.push(`${prefix}${message}`);
  }

  /**
   * Add an error.
   * @param message Error message.
   * @param section Optional section name.
   */
  addError(message: string, section?: string): void {
    const prefix = section ? `[${section}] ` : "";
    this.errors.push(`${prefix}${message}`);
  }

  /**
   * Add a fallback notice (when normalization had to use fallback logic).
   * @param message Fallback notice.
   * @param section Optional section name.
   */
  addFallback(message: string, section?: string): void {
    const prefix = section ? `[${section}] ` : "";
    this.fallbacks.push(`${prefix}${message}`);
    this.warnings.push(`${prefix}Fallback: ${message}`);
  }

  /**
   * Add a degraded evidence notice (when evidence quality is reduced).
   * @param message Degraded evidence notice.
   * @param section Optional section name.
   */
  addDegraded(message: string, section?: string): void {
    const prefix = section ? `[${section}] ` : "";
    this.degraded.push(`${prefix}${message}`);
    this.warnings.push(`${prefix}Degraded: ${message}`);
  }

  /**
   * Add warnings from an array.
   * @param warnings Array of warning strings.
   * @param section Optional section name.
   */
  addWarnings(warnings: string[], section?: string): void {
    for (const w of warnings) {
      this.addWarning(w, section);
    }
  }

  /** Get all warnings. */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /** Get all errors. */
  getErrors(): string[] {
    return [...this.errors];
  }

  /** Get all fallback notices. */
  getFallbacks(): string[] {
    return [...this.fallbacks];
  }

  /** Get all degraded evidence notices. */
  getDegraded(): string[] {
    return [...this.degraded];
  }

  /** Check if any errors were recorded. */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /** Check if any warnings were recorded. */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /** Get total diagnostic count. */
  totalCount(): number {
    return this.warnings.length + this.errors.length;
  }
}

/**
 * Create a new normalization diagnostics collector.
 * @returns A new NormalizationDiagnostics instance.
 */
export function createDiagnostics(): NormalizationDiagnostics {
  return new NormalizationDiagnostics();
}
