import { getPlantDateNow } from '@pkg/domain';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { MechanicsTab } from './MechanicsTab.js';
import { ReportWindowPicker } from './ReportWindowPicker.js';
import {
  formatReportSubject,
  formatReportWindowParam,
  parseReportSubject,
  parseReportWindowParam,
  type ReportsSearch,
  type ReportTab,
} from './report-search.js';
import { UtilisationTab } from './UtilisationTab.js';

/** Fleet utilisation and mechanic performance; one window picker serves both tabs. The URL is decoded here only. */
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
    <PageLayout
      title="Reports"
      description="How hard the fleet works and how fast the workshop fixes it."
      size="full"
      actions={
        <ReportWindowPicker
          window={window}
          today={today}
          onChange={(next) => onSearchChange({ window: formatReportWindowParam(next) })}
        />
      }
    >
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
            onSubjectChange={(next) => onSearchChange({ subject: formatReportSubject(next) })}
          />
        </TabsContent>
        <TabsContent className="pt-4" value="mechanics">
          <MechanicsTab window={window} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
