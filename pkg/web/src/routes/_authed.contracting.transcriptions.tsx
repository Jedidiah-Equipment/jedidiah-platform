import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { TranscriptionsPage, transcriptionTabs } from '@/contracting/pages/transcriptions/TranscriptionsPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/transcriptions')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_transcription:read'),
  validateSearch: z.object({
    tab: z.enum(transcriptionTabs).optional(),
    hint: UUID.optional(),
    from: UUID.optional(),
  }),
  staticData: { pageLabel: 'Transcriptions' },
  component: TranscriptionsRoute,
});

function TranscriptionsRoute() {
  const { tab = 'transcriptions', hint, from } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TranscriptionsPage
      tab={tab}
      selectedHintId={hint}
      fromTranscriptionId={from}
      onTabChange={(next) => void navigate({ search: { tab: next } })}
    />
  );
}
