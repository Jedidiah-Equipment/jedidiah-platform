import { createFileRoute } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import content from '@/assets/job-overhaul-overview.md?raw';
import { Card } from '@/components/ui/card';

export const Route = createFileRoute('/job-overhaul-overview')({
  component: JobOverhaulOverviewPage,
});

function JobOverhaulOverviewPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Card className="px-8 py-8">
        <article className="overview-markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </article>
      </Card>
      <style>{`
        .overview-markdown h1 { font-size: 2rem; font-weight: 700; margin: 1.5rem 0 1rem; }
        .overview-markdown h2 { font-size: 1.5rem; font-weight: 600; margin: 2rem 0 0.75rem; }
        .overview-markdown h3 { font-size: 1.15rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
        .overview-markdown p { margin: 0.75rem 0; line-height: 1.6; background: transparent; }
        .overview-markdown ul, .overview-markdown ol { margin: 0.75rem 0; padding-left: 1.75rem; background: transparent; }
        .overview-markdown ul { list-style: disc; }
        .overview-markdown ol { list-style: decimal; }
        .overview-markdown li { margin: 0.4rem 0; padding-left: 0.25rem; background: transparent; }
        .overview-markdown li > p { margin: 0; background: transparent; }
        .overview-markdown li::marker { color: rgba(255,255,255,0.55); }
        .overview-markdown strong { font-weight: 600; background: transparent; }
        .overview-markdown code { background: rgba(127,127,127,0.18); color: inherit; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }
        .overview-markdown pre { background: rgba(127,127,127,0.14); color: inherit; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; }
        .overview-markdown pre code { background: transparent; padding: 0; color: inherit; }
        .overview-markdown table { border-collapse: collapse; margin: 1rem 0; width: 100%; display: table; }
        .overview-markdown th, .overview-markdown td { border: 1px solid rgba(127,127,127,0.3); padding: 0.5rem 0.75rem; text-align: left; }
        .overview-markdown th { background: rgba(127,127,127,0.12); font-weight: 600; }
        .overview-markdown hr { border: 0; border-top: 1px solid rgba(127,127,127,0.3); margin: 2rem 0; }
        .overview-markdown blockquote { border-left: 3px solid rgba(127,127,127,0.4); padding-left: 1rem; margin: 1rem 0; opacity: 0.85; }
      `}</style>
    </div>
  );
}
