export type MermaidDiagramType = 'flowchart' | 'sequenceDiagram' | 'classDiagram' | 'stateDiagram-v2';

export type DiagramRegistryEntry =
  | { key: string; label: string; method: 'mermaid'; mermaidType: MermaidDiagramType }
  | { key: string; label: string; method: 'custom_svg_template'; template: 'use_case_diagram' };

export const DIAGRAM_REGISTRY: Record<string, DiagramRegistryEntry> = {
  conceptual_framework: { key: 'conceptual_framework', label: 'Conceptual Framework', method: 'mermaid', mermaidType: 'flowchart' },
  contextual_model: { key: 'contextual_model', label: 'Contextual Model', method: 'mermaid', mermaidType: 'flowchart' },
  use_case_model: { key: 'use_case_model', label: 'Use Case Model', method: 'custom_svg_template', template: 'use_case_diagram' },
  sequence_diagram: { key: 'sequence_diagram', label: 'Sequence Diagram', method: 'mermaid', mermaidType: 'sequenceDiagram' },
  state_machine_diagram: { key: 'state_machine_diagram', label: 'State Machine Diagram', method: 'mermaid', mermaidType: 'stateDiagram-v2' },
  activity_diagram: { key: 'activity_diagram', label: 'Activity Diagram', method: 'mermaid', mermaidType: 'flowchart' },
  class_diagram: { key: 'class_diagram', label: 'Class Diagram', method: 'mermaid', mermaidType: 'classDiagram' },
};

export function getDiagramRegistryEntry(diagramKey: string): DiagramRegistryEntry | null {
  return DIAGRAM_REGISTRY[diagramKey] || null;
}

export function isKnownDiagramKey(diagramKey: string): boolean {
  return Boolean(DIAGRAM_REGISTRY[diagramKey]);
}
