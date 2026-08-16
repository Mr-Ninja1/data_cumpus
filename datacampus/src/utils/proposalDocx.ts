// Builds a real, print-ready Word document (.docx) for a proposal export —
// this is the "native Word TOC field" and "real document structure, not
// markdown symbols" fix from idea.md Sections 2 and 4. Numbered/markdown
// headings become actual Word Heading styles (so Word's native
// "Update Table" TOC field picks them up), and the whole document defaults
// to Times New Roman.

import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, TableOfContents, TextRun } from 'docx';
import { parseMarkdownToBlocks, type InlineRun } from './markdownBlocks';
import { formatIeeeReference, type IeeeReferenceEntry } from './ieeeReferences';

const FONT = 'Times New Roman';
const BODY_SIZE = 24; // half-points -> 12pt
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

type ChapterEntry = { chapter_key?: string; title?: string; content_md?: string; incomplete?: boolean; missing_sections?: string[] };
type ReferenceEntry = IeeeReferenceEntry;

function runsToTextRuns(runs: InlineRun[]): TextRun[] {
  return runs.map(
    (run) =>
      new TextRun({
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        font: FONT,
        size: BODY_SIZE,
      })
  );
}

/** Converts one chapter's markdown into real Word paragraphs — numbered
 * ("1.1 Background") and markdown (##) headings become actual Heading
 * styles, not bold text, so Word's native TOC field can read them. */
export type RenderedDiagramLookup = Record<string, { data: Buffer | Uint8Array; width: number; height: number } | undefined>;

function chapterMarkdownToParagraphs(markdown: string, diagrams?: RenderedDiagramLookup): Paragraph[] {
  const blocks = parseMarkdownToBlocks(markdown);
  const paragraphs: Paragraph[] = [];

  for (const block of blocks) {
    if (block.type === 'diagram') {
      const rendered = diagrams?.[block.diagramKey];
      if (rendered) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 80 },
            children: [new ImageRun({ type: 'png', data: rendered.data, transformation: { width: rendered.width, height: rendered.height } })],
          })
        );
        if (block.description) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [new TextRun({ text: block.description, font: FONT, size: 20, italics: true })],
            })
          );
        }
      } else {
        // Not rendered yet (or generation failed) — say so plainly instead of
        // silently dropping the marker or pretending a diagram exists.
        paragraphs.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `[Diagram pending: ${block.description || block.diagramKey}]`, font: FONT, size: BODY_SIZE, italics: true, color: '64748B' }),
            ],
          })
        );
      }
      continue;
    }
    if (block.type === 'heading') {
      const headingLevel = HEADING_LEVELS[Math.min(Math.max(block.level - 1, 1), HEADING_LEVELS.length - 1)];
      paragraphs.push(
        new Paragraph({
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
          children: runsToTextRuns(block.runs),
        })
      );
      continue;
    }
    if (block.type === 'bullet_list') {
      for (const item of block.items) {
        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: runsToTextRuns(item),
          })
        );
      }
      continue;
    }
    if (block.type === 'numbered_list') {
      for (const item of block.items) {
        paragraphs.push(
          new Paragraph({
            numbering: { reference: 'proposal-numbered-list', level: 0 },
            spacing: { after: 80 },
            children: runsToTextRuns(item),
          })
        );
      }
      continue;
    }
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 360 },
        children: runsToTextRuns(block.runs),
      })
    );
  }

  if (!paragraphs.length) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: 'Pending chapter content.', font: FONT, size: BODY_SIZE, italics: true })] }));
  }

  return paragraphs;
}

function toIeeeReferenceText(ref: ReferenceEntry, index: number): string {
  return formatIeeeReference(ref, index);
}

function centeredParagraph(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; upper?: boolean; spacingBefore?: number } = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: opts.spacingBefore ?? 0, after: 200 },
    children: [
      new TextRun({
        text: opts.upper ? text.toUpperCase() : text,
        bold: opts.bold,
        italics: opts.italics,
        font: FONT,
        size: opts.size ?? BODY_SIZE,
      }),
    ],
  });
}

export type DocxLogo = {
  data: Buffer | Uint8Array;
  type: 'jpg' | 'png' | 'gif' | 'bmp';
  width: number;
  height: number;
};

export type BuildProposalDocxInput = {
  project: { title?: string; department?: string | null; supervisor?: string | null; academic_year?: string | number | null };
  chapters: ChapterEntry[];
  references: ReferenceEntry[];
  schoolName: string;
  program: string;
  studentName: string;
  studentId: string;
  logo?: DocxLogo | null;
  diagrams?: RenderedDiagramLookup;
};

const CHAPTER_ORDER = ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5', 'chapter_6'];
const CHAPTER_NUMBER_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

function chapterHeadingText(key: string, title: string): string {
  const match = key.match(/chapter_(\d+)/);
  if (!match) return (title || key).toUpperCase();
  const idx = parseInt(match[1], 10) - 1;
  const word = CHAPTER_NUMBER_WORDS[idx] ?? match[1];
  
  // If title is generic "Chapter X" or empty, don't duplicate — just use the chapter number.
  // Otherwise, append the actual chapter title (e.g., "Introduction", "Literature Review").
  const isGenericTitle = !title || title.toLowerCase() === `chapter ${match[1]}`;
  const suffix = isGenericTitle ? '' : `: ${title.toUpperCase()}`;
  return `CHAPTER ${word}${suffix}`;
}

export async function buildProposalDocx(input: BuildProposalDocxInput): Promise<Buffer> {
  const { project, chapters, references, schoolName, program, studentName, studentId, logo } = input;
  const byKey = new Map(chapters.map((chapter) => [chapter.chapter_key, chapter]));
  const year = String(project.academic_year || new Date().getFullYear());

  const coverChildren: Paragraph[] = [];
  if (logo) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new ImageRun({
            type: logo.type,
            data: logo.data,
            transformation: { width: logo.width, height: logo.height },
          }),
        ],
      })
    );
  }
  coverChildren.push(
    centeredParagraph(schoolName, { bold: true, size: 32 }),
    centeredParagraph(program, { italics: true, size: 26, spacingBefore: 120 }),
    centeredParagraph(project.title || 'Untitled Proposal', { bold: true, size: 30, spacingBefore: 800 }),
    centeredParagraph('By', { italics: true, spacingBefore: 400 })
  );
  if (studentName) coverChildren.push(centeredParagraph(studentName, { bold: true, upper: true, size: 26 }));
  if (studentId) coverChildren.push(centeredParagraph(`Student Number: ${studentId}`));
  if (project.supervisor) coverChildren.push(centeredParagraph(`Supervisor: ${project.supervisor}`, { spacingBefore: 400 }));
  coverChildren.push(centeredParagraph('NDOLA, ZAMBIA', { bold: true, spacingBefore: 800 }));
  coverChildren.push(centeredParagraph(year));

  // Table of Contents uses a native Word TOC field, not static text.
  // Word reads the actual heading styles in the document and auto-generates
  // the TOC with correct page numbers. When chapters 4–6 are added later,
  // just refresh this field to update it automatically.
  const tocSection = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: 'Table of Contents', font: FONT, size: 32, bold: true })] }),
    new TableOfContents('Table of Contents', {
      hyperlink: true,
      headingStyleRange: '1-6',
    }),
  ];

  const chapterSections: Paragraph[] = [];
  for (const key of CHAPTER_ORDER) {
    const chapter = byKey.get(key);
    if (!chapter) continue;
    chapterSections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { after: chapter.incomplete ? 80 : 240 },
        children: [new TextRun({ text: chapterHeadingText(key, chapter.title || ''), font: FONT, size: 32, bold: true })],
      })
    );
    if (chapter.incomplete) {
      // The model didn't finish every required section here (most often a
      // token-limited model cutting a response short) — call it out right
      // under the heading so it can never look like a finished chapter,
      // even if the document was exported before it was completed.
      chapterSections.push(
        new Paragraph({
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: `INCOMPLETE — missing section(s): ${chapter.missing_sections?.length ? chapter.missing_sections.join(', ') : 'see draft'}.`,
              font: FONT,
              size: 22,
              bold: true,
              color: 'B45309',
              italics: true,
            }),
          ],
        })
      );
    }
    chapterSections.push(...chapterMarkdownToParagraphs(chapter.content_md || '', input.diagrams));
  }

  const referencesSection: Paragraph[] = [];
  if (references.length) {
    referencesSection.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { after: 240 },
        children: [new TextRun({ text: 'References', font: FONT, size: 32, bold: true })],
      })
    );
    references.forEach((ref, index) => {
      referencesSection.push(
        new Paragraph({
          spacing: { after: 160 },
          indent: { left: 360, hanging: 360 },
          children: [new TextRun({ text: toIeeeReferenceText(ref, index), font: FONT, size: BODY_SIZE })],
        })
      );
    });
  }

  const doc = new Document({
    features: {
      // Forces Word to recompute all fields (including the Table of
      // Contents) the moment the document is opened, instead of showing an
      // empty TOC until the user manually right-clicks -> Update Field.
      updateFields: true,
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true }, paragraph: { spacing: { before: 240, after: 200 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { spacing: { before: 200, after: 160 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true }, paragraph: { spacing: { before: 160, after: 120 } } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, italics: true }, paragraph: { spacing: { before: 140, after: 100 } } },
        { id: 'Heading5', name: 'Heading 5', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, italics: true }, paragraph: { spacing: { before: 120, after: 100 } } },
        { id: 'Heading6', name: 'Heading 6', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, italics: true }, paragraph: { spacing: { before: 100, after: 100 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'proposal-numbered-list',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children: [...coverChildren, ...tocSection, ...chapterSections, ...referencesSection],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
