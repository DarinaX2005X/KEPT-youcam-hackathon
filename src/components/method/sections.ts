/** Sections of /how-it-works, in page order. The index and the page both read this list. */
export const SECTIONS = [
  { id: 'gallery-photos', title: 'Why photos from your gallery don’t work' },
  { id: 'what-youcam-measures', title: 'What YouCam measures' },
  { id: 'real-change', title: 'How much change is real' },
  { id: 'timelines', title: 'Timelines by ingredient' },
  { id: 'verdict', title: 'How the verdict is decided' },
  { id: 'your-device', title: 'What stays on your device' },
  { id: 'limits', title: 'Limits' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export function sectionTitle(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.title ?? '';
}
