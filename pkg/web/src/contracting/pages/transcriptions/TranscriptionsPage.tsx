import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { HintTable } from './HintTable.js';
import { PromptsPanel } from './PromptsPanel.js';
import { TranscriptionTable } from './TranscriptionTable.js';

export const transcriptionTabs = ['transcriptions', 'hints', 'prompts'] as const;
export type TranscriptionTab = (typeof transcriptionTabs)[number];

/** Read-only review of every Voice Note's text, the Transcription Hints learned from them, and the model prompts. */
export function TranscriptionsPage({
  tab,
  selectedHintId,
  fromTranscriptionId,
  onTabChange,
}: {
  tab: TranscriptionTab;
  selectedHintId: string | undefined;
  fromTranscriptionId: string | undefined;
  onTabChange: (tab: TranscriptionTab) => void;
}) {
  return (
    <PageLayout
      title="Transcriptions"
      description="What each Voice Note heard, showed and kept, the hints learned from corrections, and the prompts the models are sent."
      size="full"
    >
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as TranscriptionTab)} size="sm">
        <TabsList variant="default">
          <TabsTrigger value="transcriptions">Transcriptions</TabsTrigger>
          <TabsTrigger value="hints">Hints</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="transcriptions">
          <TranscriptionTable />
        </TabsContent>
        <TabsContent className="pt-4" value="hints">
          <HintTable selectedHintId={selectedHintId} fromTranscriptionId={fromTranscriptionId} />
        </TabsContent>
        <TabsContent className="pt-4" value="prompts">
          <PromptsPanel />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
