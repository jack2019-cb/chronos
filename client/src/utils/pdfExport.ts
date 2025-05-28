export interface ExportToPDFOptions {
  year: number;
  selectedMonths: string[];
  events: Array<{ date: string; title: string }>;
  backgroundUrl?: string;
}

export function exportToPDF(options: ExportToPDFOptions) {
  // TODO: Implement PDF export logic
  // Placeholder: does nothing for now
}
