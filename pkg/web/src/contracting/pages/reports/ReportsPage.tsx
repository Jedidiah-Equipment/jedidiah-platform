import { getPlantDateNow } from '@pkg/domain';
import { parseReportWindowParam } from '@pkg/domain/contracting';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { MechanicsTab } from './MechanicsTab.js';
import { ReportWindowPicker } from './ReportWindowPicker.js';
import { parseReportSubject } from './report-subject.js';
import { UtilisationTab } from './UtilisationTab.js';

export const reportTabs = ['utilisation', 'mechanics'] as const;
export type ReportTab = (typeof reportTabs)[number];
export type ReportsSearch = { tab?: ReportTab | undefined; window?: string | undefined; subject?: string | undefined };

/** Fleet utilisation and mechanic performance; one window picker serves both tabs. */
export function ReportsPage({
  search,
  onSearchChange,
}: {
  search: ReportsSearch;
  onSearchChange: (next: ReportsSearch) => void;
}) {
  const today = getPlantDateNow();
  const window = parseReportWindowParam(search.window, today);
  const subject = parseReportSubject(search.subject);
  return (
    <PageLayout title="Reports" description="How hard the fleet works and how fast the workshop fixes it." size="full">
      <ReportWindowPicker window={window} today={today} onChange={(next) => onSearchChange({ window: next })} />
      <Tabs
        value={search.tab ?? 'utilisation'}
        onValueChange={(value) => onSearchChange({ tab: value as ReportTab })}
        size="sm"
      >
        <TabsList variant="default">
          <TabsTrigger value="utilisation">Utilisation</TabsTrigger>
          <TabsTrigger value="mechanics">Mechanics</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="utilisation">
          <UtilisationTab
            window={window}
            subject={subject}
            onSubjectChange={(next) => onSearchChange({ subject: next })}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="mechanics">
          <MechanicsTab window={window} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
